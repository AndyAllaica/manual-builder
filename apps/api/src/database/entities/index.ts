import { ActionEntity } from './action.entity';
import { AssetEntity } from './asset.entity';
import { CaptureEntity } from './capture.entity';
import { CaptureSessionEntity } from './capture-session.entity';
import { ManualEntity } from './manual.entity';
import { ManualStepEntity } from './manual-step.entity';
import { ManualVersionEntity } from './manual-version.entity';
import { SystemEntity } from './system.entity';
import { SystemModuleEntity } from './system-module.entity';
import { UserEntity } from './user.entity';
import { WorkspaceMemberEntity } from './workspace-member.entity';
import { WorkspaceEntity } from './workspace.entity';

export {
  ActionEntity,
  AssetEntity,
  CaptureEntity,
  CaptureSessionEntity,
  ManualEntity,
  ManualStepEntity,
  ManualVersionEntity,
  SystemEntity,
  SystemModuleEntity,
  UserEntity,
  WorkspaceMemberEntity,
  WorkspaceEntity,
};

export const MANUAL_BUILDER_ENTITIES = [
  UserEntity,
  WorkspaceEntity,
  WorkspaceMemberEntity,
  SystemEntity,
  SystemModuleEntity,
  ActionEntity,
  AssetEntity,
  CaptureSessionEntity,
  CaptureEntity,
  ManualEntity,
  ManualVersionEntity,
  ManualStepEntity,
] as const;
