import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ActionEntity } from './action.entity';
import { CaptureEntity } from './capture.entity';
import { type CaptureSessionStatus } from '../../domain/manual-builder.types';

@Entity({ name: 'capture_sessions' })
export class CaptureSessionEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'action_id', type: 'uuid' })
  actionId!: string;

  @Column({ name: 'started_by', type: 'varchar', length: 120 })
  startedBy!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: CaptureSessionStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => ActionEntity, (action) => action.captureSessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action!: ActionEntity;

  @OneToMany(() => CaptureEntity, (capture) => capture.session)
  captures!: CaptureEntity[];
}
