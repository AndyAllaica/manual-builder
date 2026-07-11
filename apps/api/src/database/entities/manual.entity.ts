import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ActionEntity } from './action.entity';
import { ManualVersionEntity } from './manual-version.entity';
import { type ManualStatus } from '../../domain/manual-builder.types';

@Entity({ name: 'manuals' })
export class ManualEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'action_id', type: 'uuid' })
  actionId!: string;

  @Column({ type: 'varchar', length: 180 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: ManualStatus;

  @Column({ name: 'current_version_id', type: 'uuid', nullable: true })
  currentVersionId!: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 120 })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => ActionEntity, (action) => action.manuals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action!: ActionEntity;

  @OneToMany(() => ManualVersionEntity, (version) => version.manual)
  versions!: ManualVersionEntity[];
}
