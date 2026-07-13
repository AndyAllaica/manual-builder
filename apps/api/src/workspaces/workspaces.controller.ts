import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { SimpleAuthGuard } from '../auth/simple-auth.guard';
import { type AuthenticatedUser } from '../auth/auth.types';
import { AddWorkspaceMemberDto } from './dto/add-workspace-member.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { WorkspacesService } from './workspaces.service';

@Controller({ path: 'workspaces', version: '1' })
@UseGuards(SimpleAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  listWorkspaces(@CurrentUser() user: AuthenticatedUser) {
    return this.workspacesService.listWorkspaces(user);
  }

  @Post()
  createWorkspace(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateWorkspaceDto,
  ) {
    return this.workspacesService.createWorkspace(user, body);
  }

  @Get(':workspaceId/members')
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.listMembers(user, workspaceId);
  }

  @Post(':workspaceId/members')
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: AddWorkspaceMemberDto,
  ) {
    return this.workspacesService.addMember(user, workspaceId, {
      username: body.username,
      role: body.role ?? 'editor',
    });
  }
}
