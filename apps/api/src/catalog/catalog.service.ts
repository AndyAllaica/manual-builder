import { Injectable } from '@nestjs/common';
import { ManualBuilderRepository } from '../data/manual-builder.repository';
import { type CreateActionInput, type CreateSystemInput, type CreateSystemModuleInput } from '../domain/manual-builder.types';

@Injectable()
export class CatalogService {
  constructor(private readonly repository: ManualBuilderRepository) {}

  async getWorkspaceOverview() {
    const workspace = await this.repository.getWorkspace();
    const systems = await this.repository.listSystems();

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

  async getSystemTree(systemId: string) {
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

  createSystem(input: CreateSystemInput) {
    return this.repository.createSystem(input);
  }

  createSystemModule(input: CreateSystemModuleInput) {
    return this.repository.createSystemModule(input);
  }

  createAction(input: CreateActionInput) {
    return this.repository.createAction(input);
  }
}
