import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { SystemEntity } from './system.entity';
import { ActionEntity } from './action.entity';

@Entity({ name: 'system_modules' })
@Index(['systemId', 'key'], { unique: true })
export class SystemModuleEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'system_id', type: 'uuid' })
  systemId!: string;

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

  @ManyToOne(() => SystemEntity, (system) => system.systemModules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'system_id' })
  system!: SystemEntity;

  @OneToMany(() => ActionEntity, (action) => action.systemModule)
  actions!: ActionEntity[];
}
