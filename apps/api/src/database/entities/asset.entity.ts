import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { type AssetStorageProvider } from '../../domain/manual-builder.types';

@Entity({ name: 'assets' })
export class AssetEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40 })
  provider!: AssetStorageProvider;

  @Column({ type: 'varchar', length: 20 })
  kind!: 'original' | 'context';

  @Column({ name: 'mime_type', type: 'varchar', length: 120 })
  mimeType!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ name: 'storage_path', type: 'varchar', length: 500 })
  storagePath!: string;

  @Column({ name: 'public_url', type: 'text', default: '' })
  publicUrl!: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
