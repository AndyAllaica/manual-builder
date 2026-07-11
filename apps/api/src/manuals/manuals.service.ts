import { Injectable } from '@nestjs/common';
import { ManualBuilderRepository } from '../data/manual-builder.repository';
import { type AddStepFromCaptureInput, type CreateManualInput } from '../domain/manual-builder.types';

@Injectable()
export class ManualsService {
  constructor(private readonly repository: ManualBuilderRepository) {}

  createManual(input: CreateManualInput) {
    return this.repository.createManual(input);
  }

  async listManualsByAction(actionId: string) {
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

  async getManual(manualId: string) {
    const manual = await this.repository.findManualById(manualId);
    const action = await this.repository.findActionById(manual.actionId);
    const systemModule = await this.repository.findSystemModuleById(action.moduleId);
    const system = await this.repository.findSystemById(systemModule.systemId);
    const currentVersion = await this.repository.findManualVersionById(manual.currentVersionId);
    const steps = await Promise.all((await this.repository.listManualStepsByVersionId(currentVersion.id)).map(async (step) => ({
      ...step,
      asset: await this.repository.findAssetById(step.assetId),
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

  async addStepFromCapture(manualId: string, input: AddStepFromCaptureInput) {
    const step = await this.repository.addStepFromCapture(manualId, input);

    return {
      step,
      asset: await this.repository.findAssetById(step.assetId),
    };
  }
}
