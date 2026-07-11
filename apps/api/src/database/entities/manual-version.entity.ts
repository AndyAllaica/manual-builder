import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ManualEntity } from './manual.entity';
import { ManualStepEntity } from './manual-step.entity';
import { type ManualVersionStatus } from '../../domain/manual-builder.types';

@Entity({ name: 'manual_versions' })
export class ManualVersionEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'manual_id', type: 'uuid' })
  manualId!: string;

  @Column({ name: 'version_label', type: 'varchar', length: 50 })
  versionLabel!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: ManualVersionStatus;

  @Column({ name: 'created_by', type: 'varchar', length: 120 })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => ManualEntity, (manual) => manual.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'manual_id' })
  manual!: ManualEntity;

  @OneToMany(() => ManualStepEntity, (step) => step.version)
  steps!: ManualStepEntity[];
}
