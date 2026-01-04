import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ShareSession } from './share-session.entity';

export type CodePermission = 'read' | 'control';

@Entity('share_codes')
export class ShareCode {
  @PrimaryColumn()
  code: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => ShareSession, (session) => session.codes)
  @JoinColumn({ name: 'sessionId' })
  session: ShareSession;

  @Column()
  permission: CodePermission;

  @Column({ type: 'int', nullable: true })
  maxUses: number | null;

  @Column({ default: 0 })
  currentUses: number;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ default: false })
  revoked: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
