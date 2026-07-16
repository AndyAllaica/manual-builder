import { ConflictException, Injectable } from '@nestjs/common';
import { type AuthenticatedUser } from '../auth/auth.types';
import { ManualBuilderRepository } from '../data/manual-builder.repository';
import {
  type AddStepFromCaptureInput,
  type CreateManualInput,
  type UpdateManualStepInput,
} from '../domain/manual-builder.types';

@Injectable()
export class ManualsService {
  constructor(private readonly repository: ManualBuilderRepository) {}

  async createManual(user: AuthenticatedUser, input: CreateManualInput) {
    await this.repository.ensureUserCanEditWorkspace(
      user.id,
      await this.repository.getWorkspaceIdByActionId(input.actionId),
    );

    const existingManuals = await this.repository.listManualsByActionId(input.actionId);
    if (existingManuals.length > 0) {
      throw new ConflictException('La accion seleccionada ya tiene un manual. Carga el manual existente en lugar de crear otro.');
    }

    return this.repository.createManual({
      ...input,
      createdBy: user.displayName || user.username,
    });
  }

  async listManualsByAction(user: AuthenticatedUser, actionId: string) {
    await this.repository.ensureUserCanAccessWorkspace(
      user.id,
      await this.repository.getWorkspaceIdByActionId(actionId),
    );

    const manuals = await this.repository.listManualsByActionId(actionId);

    return Promise.all(manuals.map(async (manual) => {
      const currentVersion = await this.repository.findManualVersionById(manual.currentVersionId);
      const steps = await this.repository.listManualStepsByVersionId(currentVersion.id);

      return {
        ...manual,
        currentVersion,
        stepCount: steps.length,
      };
    }));
  }

  async getManual(user: AuthenticatedUser, manualId: string) {
    await this.repository.ensureUserCanAccessWorkspace(
      user.id,
      await this.repository.getWorkspaceIdByManualId(manualId),
    );

    const manual = await this.repository.findManualById(manualId);
    const action = await this.repository.findActionById(manual.actionId);
    const systemModule = await this.repository.findSystemModuleById(action.moduleId);
    const system = await this.repository.findSystemById(systemModule.systemId);
    const currentVersion = await this.repository.findManualVersionById(manual.currentVersionId);
    const steps = await Promise.all((await this.repository.listManualStepsByVersionId(currentVersion.id)).map(async (step) => ({
      ...step,
      asset: await this.repository.findAssetById(step.assetId),
      sourceCapture: step.sourceCaptureId === null
        ? null
        : await this.getStepSourceCaptureWithAssets(step.sourceCaptureId),
    })));

    return {
      manual,
      currentVersion,
      action,
      systemModule,
      system,
      steps,
    };
  }

  async addStepFromCapture(user: AuthenticatedUser, manualId: string, input: AddStepFromCaptureInput) {
    const manualWorkspaceId = await this.repository.getWorkspaceIdByManualId(manualId);
    await this.repository.ensureUserCanEditWorkspace(user.id, manualWorkspaceId);

    const captureWorkspaceId = await this.repository.getWorkspaceIdByCaptureId(input.captureId);
    if (manualWorkspaceId !== captureWorkspaceId) {
      throw new ConflictException('La captura no pertenece al mismo workspace que el manual.');
    }

    const step = await this.repository.addStepFromCapture(manualId, input);

    return {
      step,
      asset: await this.repository.findAssetById(step.assetId),
    };
  }

  async updateManualStep(user: AuthenticatedUser, stepId: string, input: UpdateManualStepInput) {
    await this.repository.ensureUserCanEditWorkspace(
      user.id,
      await this.repository.getWorkspaceIdByManualStepId(stepId),
    );

    const step = await this.repository.updateManualStep(stepId, input);

    return {
      step,
      asset: await this.repository.findAssetById(step.assetId),
    };
  }

  async deleteManualStep(user: AuthenticatedUser, stepId: string) {
    await this.repository.ensureUserCanEditWorkspace(
      user.id,
      await this.repository.getWorkspaceIdByManualStepId(stepId),
    );

    return this.repository.deleteManualStep(stepId);
  }

  private async getStepSourceCaptureWithAssets(captureId: string) {
    const capture = await this.repository.findCaptureById(captureId);

    return {
      ...capture,
      originalAsset: await this.repository.findAssetById(capture.originalAssetId),
      contextAsset: capture.contextAssetId === null ? null : await this.repository.findAssetById(capture.contextAssetId),
    };
  }
}
