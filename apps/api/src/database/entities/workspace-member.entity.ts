import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from './user.entity';
import { WorkspaceEntity } from './workspace.entity';
import { type WorkspaceMemberRole } from '../../domain/manual-builder.types';

@Entity({ name: 'workspace_members' })
@Index(['workspaceId', 'userId'], { unique: true })
export class WorkspaceMemberEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: WorkspaceMemberRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => WorkspaceEntity, (workspace) => workspace.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @ManyToOne(() => UserEntity, (user) => user.workspaceMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;
}
