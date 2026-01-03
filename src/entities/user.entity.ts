import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { ShareSession } from './share-session.entity';

export type UserTier = 'free' | 'pro' | 'admin';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint', unique: true })
  githubId: string;

  @Column()
  username: string;

  @Column({ nullable: true })
  email: string;

  @Column({ default: 'free' })
  tier: UserTier;

  @Column({ nullable: true })
  stripeCustomerId: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => ShareSession, (session) => session.host)
  sessions: ShareSession[];
}
