import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { type WorkspaceMemberRole } from '../../domain/manual-builder.types';

const WORKSPACE_MEMBER_ROLES: WorkspaceMemberRole[] = ['admin', 'editor', 'viewer'];

export class AddWorkspaceMemberDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  username!: string;

  @IsOptional()
  @IsIn(WORKSPACE_MEMBER_ROLES)
  role?: WorkspaceMemberRole;
}
