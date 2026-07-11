import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { SystemModuleEntity } from './system-module.entity';
import { ManualEntity } from './manual.entity';
import { CaptureSessionEntity } from './capture-session.entity';

@Entity({ name: 'actions' })
@Index(['moduleId', 'key'], { unique: true })
export class ActionEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'module_id', type: 'uuid' })
  moduleId!: string;

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

  @ManyToOne(() => SystemModuleEntity, (systemModule) => systemModule.actions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'module_id' })
  systemModule!: SystemModuleEntity;

  @OneToMany(() => ManualEntity, (manual) => manual.action)
  manuals!: ManualEntity[];

  @OneToMany(() => CaptureSessionEntity, (captureSession) => captureSession.action)
  captureSessions!: CaptureSessionEntity[];
}
