import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ShareSession } from './share-session.entity';
import { User } from './user.entity';
import { ShareCode } from './share-code.entity';

@Entity('connections')
export class Connection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => ShareSession, (session) => session.connections)
  @JoinColumn({ name: 'sessionId' })
  session: ShareSession;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  codeUsed: string;

  @ManyToOne(() => ShareCode)
  @JoinColumn({ name: 'codeUsed' })
  code: ShareCode;

  @CreateDateColumn()
  connectedAt: Date;
}
