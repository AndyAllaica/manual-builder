import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CaptureSessionEntity } from './capture-session.entity';
import { AssetEntity } from './asset.entity';
import {
  type CaptureReviewStatus,
  type CaptureSelectionRect,
  type CaptureTarget,
  type CaptureViewport,
  type ManualImageFraming,
} from '../../domain/manual-builder.types';

@Entity({ name: 'captures' })
export class CaptureEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'varchar', length: 500 })
  selector!: string;

  @Column({ name: 'page_title', type: 'varchar', length: 255 })
  pageTitle!: string;

  @Column({ name: 'page_url', type: 'varchar', length: 500 })
  pageUrl!: string;

  @Column({ name: 'selected_element_tag', type: 'varchar', length: 50 })
  selectedElementTag!: string;

  @Column({ name: 'text_snippet', type: 'varchar', length: 300, nullable: true })
  textSnippet!: string | null;

  @Column({ type: 'varchar', length: 180 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'varchar', length: 20 })
  framing!: ManualImageFraming;

  @Column({ name: 'selection_rect', type: 'jsonb', nullable: true })
  selectionRect!: CaptureSelectionRect | null;

  @Column({ type: 'jsonb', nullable: true })
  viewport!: CaptureViewport | null;

  @Column({ name: 'capture_target', type: 'varchar', length: 20, default: 'element' })
  captureTarget!: CaptureTarget;

  @Column({ name: 'annotation_baked', type: 'boolean', default: false })
  annotationBaked!: boolean;

  @Column({ type: 'varchar', length: 20 })
  status!: CaptureReviewStatus;

  @Column({ name: 'original_asset_id', type: 'uuid' })
  originalAssetId!: string;

  @Column({ name: 'context_asset_id', type: 'uuid', nullable: true })
  contextAssetId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => CaptureSessionEntity, (session) => session.captures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: CaptureSessionEntity;

  @ManyToOne(() => AssetEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'original_asset_id' })
  originalAsset!: AssetEntity;

  @ManyToOne(() => AssetEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'context_asset_id' })
  contextAsset!: AssetEntity | null;
}
