import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { ShareCode } from './share-code.entity';
import { Connection } from './connection.entity';

@Entity('share_sessions')
export class ShareSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  hostUserId: string;

  @ManyToOne(() => User, (user) => user.sessions)
  @JoinColumn({ name: 'hostUserId' })
  host: User;

  @Column()
  hostPublicKey: string;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date;

  @OneToMany(() => ShareCode, (code) => code.session)
  codes: ShareCode[];

  @OneToMany(() => Connection, (conn) => conn.session)
  connections: Connection[];
}
