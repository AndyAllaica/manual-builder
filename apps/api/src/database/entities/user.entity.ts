import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { WorkspaceMemberEntity } from './workspace-member.entity';
import { type UserStatus } from '../../domain/manual-builder.types';

@Entity({ name: 'users' })
@Index(['username'], { unique: true })
export class UserEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  username!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email!: string | null;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: UserStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => WorkspaceMemberEntity, (membership) => membership.user)
  workspaceMemberships!: WorkspaceMemberEntity[];
}
