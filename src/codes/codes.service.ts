import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ShareCode, CodePermission } from '../entities/share-code.entity';
import { ShareSession } from '../entities/share-session.entity';
import { User } from '../entities/user.entity';

const TIER_LIMITS = {
  free: { maxCodes: 2, maxDuration: 30 },
  pro: { maxCodes: null, maxDuration: null },
  admin: { maxCodes: null, maxDuration: null },
};

@Injectable()
export class CodesService {
  constructor(
    @InjectRepository(ShareCode)
    private codesRepository: Repository<ShareCode>,
    @InjectRepository(ShareSession)
    private sessionsRepository: Repository<ShareSession>,
  ) {}

  private generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'SYCLX-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async create(
    sessionId: string,
    user: User,
    permission: CodePermission,
    maxUses?: number,
    expiresInMinutes?: number,
  ): Promise<ShareCode> {
    // Verify session ownership
    const session = await this.sessionsRepository.findOne({
      where: { id: sessionId, hostUserId: user.id, endedAt: IsNull() },
    });

    if (!session) {
      throw new NotFoundException('Session not found or not owned by you');
    }

    // Check tier limits for code count
    const limits = TIER_LIMITS[user.tier];
    if (limits.maxCodes !== null) {
      const codeCount = await this.codesRepository.count({
        where: { sessionId, revoked: false },
      });
      if (codeCount >= limits.maxCodes) {
        throw new ForbiddenException(
          `Code limit reached (${limits.maxCodes}). Upgrade to Pro for unlimited.`,
        );
      }
    }

    // Check tier limits for duration
    if (limits.maxDuration !== null && expiresInMinutes) {
      if (expiresInMinutes > limits.maxDuration) {
        throw new ForbiddenException(
          `Max duration is ${limits.maxDuration} minutes on free tier.`,
        );
      }
    }

    // Apply default duration for free tier if not specified
    let expiresAt: Date | null = null;
    if (expiresInMinutes) {
      expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    } else if (limits.maxDuration !== null) {
      expiresAt = new Date(Date.now() + limits.maxDuration * 60 * 1000);
    }

    // Generate unique code
    let code: string;
    let attempts = 0;
    do {
      code = this.generateCode();
      const existing = await this.codesRepository.findOne({ where: { code } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      throw new BadRequestException('Failed to generate unique code');
    }

    const shareCode = this.codesRepository.create({
      code,
      sessionId,
      permission,
      maxUses: maxUses || null,
      expiresAt,
    });

    return this.codesRepository.save(shareCode);
  }

  async validate(code: string): Promise<{
    valid: boolean;
    session?: ShareSession;
    permission?: CodePermission;
    error?: string;
  }> {
    const shareCode = await this.codesRepository.findOne({
      where: { code: code.toUpperCase() },
      relations: ['session', 'session.host'],
    });

    if (!shareCode) {
      return { valid: false, error: 'Code not found' };
    }

    if (shareCode.revoked) {
      return { valid: false, error: 'Code has been revoked' };
    }

    if (shareCode.session.endedAt) {
      return { valid: false, error: 'Session has ended' };
    }

    if (shareCode.expiresAt && shareCode.expiresAt < new Date()) {
      return { valid: false, error: 'Code has expired' };
    }

    if (
      shareCode.maxUses !== null &&
      shareCode.currentUses >= shareCode.maxUses
    ) {
      return { valid: false, error: 'Code usage limit reached' };
    }

    return {
      valid: true,
      session: shareCode.session,
      permission: shareCode.permission,
    };
  }

  async incrementUsage(code: string): Promise<void> {
    await this.codesRepository.increment({ code }, 'currentUses', 1);
  }

  async revoke(code: string, userId: string): Promise<void> {
    const shareCode = await this.codesRepository.findOne({
      where: { code },
      relations: ['session'],
    });

    if (!shareCode || shareCode.session.hostUserId !== userId) {
      throw new NotFoundException('Code not found');
    }

    shareCode.revoked = true;
    await this.codesRepository.save(shareCode);
  }

  async getBySession(sessionId: string, userId: string): Promise<ShareCode[]> {
    const session = await this.sessionsRepository.findOne({
      where: { id: sessionId, hostUserId: userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.codesRepository.find({
      where: { sessionId, revoked: false },
    });
  }
}
