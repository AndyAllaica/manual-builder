import { Injectable } from '@nestjs/common';
import { ManualBuilderRepository } from '../data/manual-builder.repository';
import { type AuthenticatedUser } from '../auth/auth.types';
import { type AddWorkspaceMemberInput, type CreateWorkspaceInput } from '../domain/manual-builder.types';

@Injectable()
export class WorkspacesService {
  constructor(private readonly repository: ManualBuilderRepository) {}

  listWorkspaces(user: AuthenticatedUser) {
    return this.repository.listWorkspacesForUser(user.id);
  }

  createWorkspace(user: AuthenticatedUser, input: Omit<CreateWorkspaceInput, 'ownerUserId'>) {
    return this.repository.createWorkspace({
      ...input,
      ownerUserId: user.id,
    });
  }

  async listMembers(user: AuthenticatedUser, workspaceId: string) {
    await this.repository.ensureUserCanAccessWorkspace(user.id, workspaceId);
    return this.repository.listWorkspaceMembers(workspaceId);
  }

  async addMember(user: AuthenticatedUser, workspaceId: string, input: AddWorkspaceMemberInput) {
    await this.repository.ensureUserCanManageWorkspace(user.id, workspaceId);
    return this.repository.addWorkspaceMember(workspaceId, input);
  }
}
