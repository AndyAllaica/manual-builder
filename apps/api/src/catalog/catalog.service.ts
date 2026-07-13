import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser } from '../auth/auth.types';
import { ManualBuilderRepository } from '../data/manual-builder.repository';
import { type CreateActionInput, type CreateSystemInput, type CreateSystemModuleInput } from '../domain/manual-builder.types';

@Injectable()
export class CatalogService {
  constructor(private readonly repository: ManualBuilderRepository) {}

  async getWorkspaceOverview(user: AuthenticatedUser) {
    const workspace = await this.repository.getFirstWorkspaceForUser(user.id);
    return this.buildWorkspaceOverview(workspace.id);
  }

  async getWorkspaceOverviewById(user: AuthenticatedUser, workspaceId: string) {
    await this.repository.ensureUserCanAccessWorkspace(user.id, workspaceId);
    return this.buildWorkspaceOverview(workspaceId);
  }

  private async buildWorkspaceOverview(workspaceId: string) {
    const workspace = await this.repository.findWorkspaceById(workspaceId);
    const systems = await this.repository.listSystemsByWorkspaceId(workspace.id);

    const systemsWithChildren = await Promise.all(systems.map(async (system) => {
      const systemModules = await this.repository.listSystemModulesBySystemId(system.id);

      const modulesWithChildren = await Promise.all(systemModules.map(async (systemModule) => {
        const actions = await this.repository.listActionsByModuleId(systemModule.id);

        const actionsWithCounts = await Promise.all(actions.map(async (action) => {
          const manuals = await this.repository.listManualsByActionId(action.id);

          return {
            ...action,
            manualCount: manuals.length,
          };
        }));

        return {
          ...systemModule,
          actionCount: actionsWithCounts.length,
          actions: actionsWithCounts,
        };
      }));

      return {
        ...system,
        moduleCount: modulesWithChildren.length,
        systemModules: modulesWithChildren,
      };
    }));

    return {
      workspace,
      totals: {
        systems: systemsWithChildren.length,
        modules: systemsWithChildren.flatMap((system) => system.systemModules).length,
        actions: systemsWithChildren.flatMap((system) => system.systemModules.flatMap((systemModule) => systemModule.actions)).length,
        manuals: systemsWithChildren.flatMap((system) =>
          system.systemModules.flatMap((systemModule) => systemModule.actions.flatMap((action) => action.manualCount > 0 ? [action.manualCount] : [])),
        ).reduce((total, count) => total + count, 0),
      },
      systems: systemsWithChildren,
    };
  }

  async getSystemTree(user: AuthenticatedUser, systemId: string) {
    await this.repository.ensureUserCanAccessWorkspace(
      user.id,
      await this.repository.getWorkspaceIdBySystemId(systemId),
    );

    const system = await this.repository.findSystemById(systemId);
    const systemModules = await this.repository.listSystemModulesBySystemId(system.id);

    const modulesWithChildren = await Promise.all(systemModules.map(async (systemModule) => {
      const actions = await this.repository.listActionsByModuleId(systemModule.id);

      const actionsWithManuals = await Promise.all(actions.map(async (action) => ({
        ...action,
        manuals: (await this.repository.listManualsByActionId(action.id)).map((manual) => ({
          id: manual.id,
          title: manual.title,
          status: manual.status,
          currentVersionId: manual.currentVersionId,
          updatedAt: manual.updatedAt,
        })),
      })));

      return {
        ...systemModule,
        actions: actionsWithManuals,
      };
    }));

    return {
      system,
      systemModules: modulesWithChildren,
    };
  }

  async createSystem(user: AuthenticatedUser, input: CreateSystemInput) {
    await this.repository.ensureUserCanEditWorkspace(user.id, input.workspaceId);
    return this.repository.createSystem(input);
  }

  async createSystemModule(user: AuthenticatedUser, input: CreateSystemModuleInput) {
    await this.repository.ensureUserCanEditWorkspace(
      user.id,
      await this.repository.getWorkspaceIdBySystemId(input.systemId),
    );

    return this.repository.createSystemModule(input);
  }

  async createAction(user: AuthenticatedUser, input: CreateActionInput) {
    await this.repository.ensureUserCanEditWorkspace(
      user.id,
      await this.repository.getWorkspaceIdBySystemModuleId(input.moduleId),
    );

    return this.repository.createAction(input);
  }
}
