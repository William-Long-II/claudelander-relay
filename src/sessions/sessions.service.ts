import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ShareSession } from '../entities/share-session.entity';
import { User } from '../entities/user.entity';

const TIER_LIMITS = {
  free: { maxShares: 1 },
  pro: { maxShares: 5 },
  admin: { maxShares: null },
};

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(ShareSession)
    private sessionsRepository: Repository<ShareSession>,
  ) {}

  async create(user: User, hostPublicKey: string, sessionName?: string): Promise<ShareSession> {
    // Check tier limits
    const activeCount = await this.countActive(user.id);
    const limit = TIER_LIMITS[user.tier]?.maxShares;

    if (limit !== null && activeCount >= limit) {
      throw new ForbiddenException(
        `Share limit reached (${limit}). Upgrade to Pro for more.`,
      );
    }

    const session = this.sessionsRepository.create({
      hostUserId: user.id,
      hostPublicKey,
      sessionName: sessionName || 'Shared Session',
    });

    return this.sessionsRepository.save(session);
  }

  async findById(id: string): Promise<ShareSession | null> {
    return this.sessionsRepository.findOne({
      where: { id },
      relations: ['host', 'codes'],
    });
  }

  async countActive(userId: string): Promise<number> {
    return this.sessionsRepository.count({
      where: { hostUserId: userId, endedAt: IsNull() },
    });
  }

  async end(id: string, userId: string): Promise<void> {
    const session = await this.sessionsRepository.findOne({
      where: { id, hostUserId: userId },
    });

    if (session) {
      session.endedAt = new Date();
      await this.sessionsRepository.save(session);
    }
  }

  async getActiveSessions(userId: string): Promise<ShareSession[]> {
    return this.sessionsRepository.find({
      where: { hostUserId: userId, endedAt: IsNull() },
      relations: ['codes'],
    });
  }
}
