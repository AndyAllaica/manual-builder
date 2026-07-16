import { ConflictException } from '@nestjs/common';
import { ManualBuilderRepository } from '../data/manual-builder.repository';
import { ManualsService } from './manuals.service';

describe('ManualsService', () => {
  it('rejects creating a second manual for the same action', async () => {
    const repository = {
      ensureUserCanEditWorkspace: jest.fn().mockResolvedValue(undefined),
      getWorkspaceIdByActionId: jest.fn().mockResolvedValue('workspace-id'),
      listManualsByActionId: jest.fn().mockResolvedValue([{ id: 'existing-manual-id' }]),
      createManual: jest.fn(),
    };
    const service = new ManualsService(repository as unknown as ManualBuilderRepository);

    await expect(service.createManual(
      { id: 'user-id', username: 'tester', displayName: 'Tester' },
      {
        actionId: 'action-id',
        title: 'Manual existente',
        createdBy: 'valor ignorado por el servicio',
      },
    )).rejects.toBeInstanceOf(ConflictException);

    expect(repository.createManual).not.toHaveBeenCalled();
  });
});
