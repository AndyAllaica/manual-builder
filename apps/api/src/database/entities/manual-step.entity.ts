import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ManualVersionEntity } from './manual-version.entity';
import { AssetEntity } from './asset.entity';
import { CaptureEntity } from './capture.entity';
import { type ManualImageFraming } from '../../domain/manual-builder.types';

@Entity({ name: 'manual_steps' })
@Index(['versionId', 'order'], { unique: true })
export class ManualStepEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'version_id', type: 'uuid' })
  versionId!: string;

  @Column({ type: 'integer' })
  order!: number;

  @Column({ type: 'varchar', length: 180 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

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

  @Column({ type: 'varchar', length: 20 })
  framing!: ManualImageFraming;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'source_capture_id', type: 'uuid', nullable: true })
  sourceCaptureId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => ManualVersionEntity, (version) => version.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'version_id' })
  version!: ManualVersionEntity;

  @ManyToOne(() => AssetEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;

  @ManyToOne(() => CaptureEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'source_capture_id' })
  sourceCapture!: CaptureEntity | null;
}
