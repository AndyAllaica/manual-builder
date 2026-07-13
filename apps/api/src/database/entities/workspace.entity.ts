import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { SystemEntity } from './system.entity';
import { WorkspaceMemberEntity } from './workspace-member.entity';

@Entity({ name: 'workspaces' })
export class WorkspaceEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => SystemEntity, (system) => system.workspace)
  systems!: SystemEntity[];

  @OneToMany(() => WorkspaceMemberEntity, (membership) => membership.workspace)
  memberships!: WorkspaceMemberEntity[];
}
