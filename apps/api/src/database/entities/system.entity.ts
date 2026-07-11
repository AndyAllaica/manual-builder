import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { WorkspaceEntity } from './workspace.entity';
import { SystemModuleEntity } from './system-module.entity';

@Entity({ name: 'systems' })
@Index(['workspaceId', 'key'], { unique: true })
export class SystemEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 50 })
  key!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => WorkspaceEntity, (workspace) => workspace.systems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @OneToMany(() => SystemModuleEntity, (systemModule) => systemModule.system)
  systemModules!: SystemModuleEntity[];
}
