# ClaudeLander Relay Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the relay server that enables E2E encrypted live session sharing between ClaudeLander users.

**Architecture:** NestJS REST API + WebSocket gateway, PostgreSQL for persistence, GitHub OAuth for auth, Stripe for billing. The server acts as a "dumb relay" - it routes encrypted blobs without being able to read session content.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Passport (GitHub OAuth), JWT, Stripe, @nestjs/websockets, Docker, Caddy

---

## Phase 1: Project Foundation

### Task 1: Scaffold NestJS Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `nest-cli.json`
- Create: `src/main.ts`
- Create: `src/app.module.ts`

**Step 1: Initialize NestJS project**

Run:
```bash
npx @nestjs/cli new . --package-manager npm --skip-git
```

Select: npm as package manager

**Step 2: Install additional dependencies**

Run:
```bash
npm install @nestjs/typeorm typeorm pg @nestjs/passport passport passport-github2 @nestjs/jwt passport-jwt @nestjs/websockets @nestjs/platform-socket.io socket.io @nestjs/config class-validator class-transformer stripe
npm install -D @types/passport-github2 @types/passport-jwt
```

**Step 3: Verify project runs**

Run: `npm run start:dev`
Expected: "Nest application successfully started"

**Step 4: Commit**

```bash
git add .
git commit -m "chore: scaffold NestJS project with dependencies"
```

---

### Task 2: Environment Configuration

**Files:**
- Create: `.env.example`
- Create: `src/config/configuration.ts`
- Modify: `src/app.module.ts`

**Step 1: Create environment template**

Create `.env.example`:
```env
# Database
DATABASE_URL=postgresql://relay:password@localhost:5432/relay

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback

# JWT
JWT_SECRET=your_jwt_secret_min_32_chars

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID=price_xxx

# App
APP_URL=http://localhost:3000
FRONTEND_URL=claudelander://
```

**Step 2: Create configuration module**

Create `src/config/configuration.ts`:
```typescript
export default () => ({
  database: {
    url: process.env.DATABASE_URL,
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl: process.env.GITHUB_CALLBACK_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceId: process.env.STRIPE_PRICE_ID,
  },
  app: {
    url: process.env.APP_URL,
    frontendUrl: process.env.FRONTEND_URL,
  },
});
```

**Step 3: Update app.module.ts with ConfigModule**

Modify `src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
  ],
})
export class AppModule {}
```

**Step 4: Create .env for local development**

```bash
cp .env.example .env
```

Edit `.env` with your local values.

**Step 5: Add .env to .gitignore**

Append to `.gitignore`:
```
.env
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add environment configuration"
```

---

### Task 3: Database Setup with TypeORM

**Files:**
- Modify: `src/app.module.ts`
- Create: `src/entities/user.entity.ts`
- Create: `src/entities/share-session.entity.ts`
- Create: `src/entities/share-code.entity.ts`
- Create: `src/entities/connection.entity.ts`

**Step 1: Configure TypeORM in app.module.ts**

Modify `src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('database.url'),
        autoLoadEntities: true,
        synchronize: process.env.NODE_ENV !== 'production',
      }),
    }),
  ],
})
export class AppModule {}
```

**Step 2: Create User entity**

Create `src/entities/user.entity.ts`:
```typescript
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
```

**Step 3: Create ShareSession entity**

Create `src/entities/share-session.entity.ts`:
```typescript
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
```

**Step 4: Create ShareCode entity**

Create `src/entities/share-code.entity.ts`:
```typescript
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
  maxUses: number;

  @Column({ default: 0 })
  currentUses: number;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date;

  @Column({ default: false })
  revoked: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
```

**Step 5: Create Connection entity**

Create `src/entities/connection.entity.ts`:
```typescript
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
```

**Step 6: Create entities index**

Create `src/entities/index.ts`:
```typescript
export * from './user.entity';
export * from './share-session.entity';
export * from './share-code.entity';
export * from './connection.entity';
```

**Step 7: Commit**

```bash
git add .
git commit -m "feat: add database entities with TypeORM"
```

---

## Phase 2: Authentication

### Task 4: Auth Module Setup

**Files:**
- Create: `src/auth/auth.module.ts`
- Create: `src/auth/auth.controller.ts`
- Create: `src/auth/auth.service.ts`
- Create: `src/auth/strategies/github.strategy.ts`
- Create: `src/auth/strategies/jwt.strategy.ts`
- Create: `src/auth/guards/jwt-auth.guard.ts`
- Modify: `src/app.module.ts`

**Step 1: Create auth service**

Create `src/auth/auth.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

interface GitHubProfile {
  id: string;
  username: string;
  emails?: { value: string }[];
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async validateGitHubUser(profile: GitHubProfile): Promise<User> {
    let user = await this.usersRepository.findOne({
      where: { githubId: profile.id },
    });

    if (!user) {
      user = this.usersRepository.create({
        githubId: profile.id,
        username: profile.username,
        email: profile.emails?.[0]?.value,
      });
      await this.usersRepository.save(user);
    }

    return user;
  }

  async login(user: User): Promise<{ accessToken: string }> {
    const payload = { sub: user.id, username: user.username };
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }
}
```

**Step 2: Create GitHub strategy**

Create `src/auth/strategies/github.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { AuthService } from '../auth.service';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get('github.clientId'),
      clientSecret: configService.get('github.clientSecret'),
      callbackURL: configService.get('github.callbackUrl'),
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
  ): Promise<any> {
    return this.authService.validateGitHubUser({
      id: profile.id,
      username: profile.username,
      emails: profile.emails,
    });
  }
}
```

**Step 3: Create JWT strategy**

Create `src/auth/strategies/jwt.strategy.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.secret'),
    });
  }

  async validate(payload: { sub: string; username: string }) {
    const user = await this.authService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
```

**Step 4: Create JWT auth guard**

Create `src/auth/guards/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

**Step 5: Create auth controller**

Create `src/auth/auth.controller.ts`:
```typescript
import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { User } from '../entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Get('github')
  @UseGuards(AuthGuard('github'))
  githubAuth() {
    // Initiates GitHub OAuth flow
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubCallback(@Req() req: any, @Res() res: Response) {
    const { accessToken } = await this.authService.login(req.user);
    const frontendUrl = this.configService.get('app.frontendUrl');
    res.redirect(`${frontendUrl}auth?token=${accessToken}`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@Req() req: { user: User }) {
    return {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      tier: req.user.tier,
    };
  }
}
```

**Step 6: Create auth module**

Create `src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GitHubStrategy } from './strategies/github.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('jwt.secret'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GitHubStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

**Step 7: Add AuthModule to app.module.ts**

Update imports in `src/app.module.ts`:
```typescript
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    // ... existing imports
    AuthModule,
  ],
})
export class AppModule {}
```

**Step 8: Commit**

```bash
git add .
git commit -m "feat: add GitHub OAuth and JWT authentication"
```

---

## Phase 3: Share Sessions & Codes

### Task 5: Sessions Module

**Files:**
- Create: `src/sessions/sessions.module.ts`
- Create: `src/sessions/sessions.controller.ts`
- Create: `src/sessions/sessions.service.ts`
- Create: `src/sessions/dto/create-session.dto.ts`
- Modify: `src/app.module.ts`

**Step 1: Create DTOs**

Create `src/sessions/dto/create-session.dto.ts`:
```typescript
import { IsString } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  hostPublicKey: string;
}
```

**Step 2: Create sessions service**

Create `src/sessions/sessions.service.ts`:
```typescript
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

  async create(user: User, hostPublicKey: string): Promise<ShareSession> {
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
```

**Step 3: Create sessions controller**

Create `src/sessions/sessions.controller.ts`:
```typescript
import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { User } from '../entities/user.entity';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private sessionsService: SessionsService) {}

  @Post()
  create(@Req() req: { user: User }, @Body() dto: CreateSessionDto) {
    return this.sessionsService.create(req.user, dto.hostPublicKey);
  }

  @Get()
  getActive(@Req() req: { user: User }) {
    return this.sessionsService.getActiveSessions(req.user.id);
  }

  @Delete(':id')
  end(@Param('id') id: string, @Req() req: { user: User }) {
    return this.sessionsService.end(id, req.user.id);
  }
}
```

**Step 4: Create sessions module**

Create `src/sessions/sessions.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { ShareSession } from '../entities/share-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShareSession])],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
```

**Step 5: Add to app.module.ts**

```typescript
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    // ... existing
    SessionsModule,
  ],
})
export class AppModule {}
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add sessions module for share session management"
```

---

### Task 6: Codes Module

**Files:**
- Create: `src/codes/codes.module.ts`
- Create: `src/codes/codes.controller.ts`
- Create: `src/codes/codes.service.ts`
- Create: `src/codes/dto/create-code.dto.ts`
- Modify: `src/app.module.ts`

**Step 1: Create DTOs**

Create `src/codes/dto/create-code.dto.ts`:
```typescript
import { IsString, IsOptional, IsInt, IsIn, Min } from 'class-validator';

export class CreateCodeDto {
  @IsIn(['read', 'control'])
  permission: 'read' | 'control';

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInMinutes?: number;
}
```

**Step 2: Create codes service**

Create `src/codes/codes.service.ts`:
```typescript
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan } from 'typeorm';
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
```

**Step 3: Create codes controller**

Create `src/codes/codes.controller.ts`:
```typescript
import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CodesService } from './codes.service';
import { CreateCodeDto } from './dto/create-code.dto';
import { User } from '../entities/user.entity';

@Controller()
export class CodesController {
  constructor(private codesService: CodesService) {}

  @Post('sessions/:sessionId/codes')
  @UseGuards(JwtAuthGuard)
  create(
    @Param('sessionId') sessionId: string,
    @Req() req: { user: User },
    @Body() dto: CreateCodeDto,
  ) {
    return this.codesService.create(
      sessionId,
      req.user,
      dto.permission,
      dto.maxUses,
      dto.expiresInMinutes,
    );
  }

  @Get('sessions/:sessionId/codes')
  @UseGuards(JwtAuthGuard)
  getBySession(
    @Param('sessionId') sessionId: string,
    @Req() req: { user: User },
  ) {
    return this.codesService.getBySession(sessionId, req.user.id);
  }

  @Get('codes/:code/validate')
  validate(@Param('code') code: string) {
    return this.codesService.validate(code);
  }

  @Delete('codes/:code')
  @UseGuards(JwtAuthGuard)
  revoke(@Param('code') code: string, @Req() req: { user: User }) {
    return this.codesService.revoke(code, req.user.id);
  }
}
```

**Step 4: Create codes module**

Create `src/codes/codes.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodesController } from './codes.controller';
import { CodesService } from './codes.service';
import { ShareCode } from '../entities/share-code.entity';
import { ShareSession } from '../entities/share-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShareCode, ShareSession])],
  controllers: [CodesController],
  providers: [CodesService],
  exports: [CodesService],
})
export class CodesModule {}
```

**Step 5: Add to app.module.ts**

```typescript
import { CodesModule } from './codes/codes.module';

@Module({
  imports: [
    // ... existing
    CodesModule,
  ],
})
export class AppModule {}
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add codes module for share code management"
```

---

## Phase 4: WebSocket Relay

### Task 7: Relay Gateway

**Files:**
- Create: `src/relay/relay.module.ts`
- Create: `src/relay/relay.gateway.ts`
- Create: `src/relay/relay.service.ts`
- Modify: `src/app.module.ts`

**Step 1: Create relay service**

Create `src/relay/relay.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connection } from '../entities/connection.entity';

interface ConnectedClient {
  socketId: string;
  userId: string;
  sessionId: string;
  permission: 'read' | 'control';
  isHost: boolean;
}

@Injectable()
export class RelayService {
  private clients: Map<string, ConnectedClient> = new Map();
  private sessionClients: Map<string, Set<string>> = new Map();

  constructor(
    @InjectRepository(Connection)
    private connectionsRepository: Repository<Connection>,
  ) {}

  addClient(client: ConnectedClient): void {
    this.clients.set(client.socketId, client);

    if (!this.sessionClients.has(client.sessionId)) {
      this.sessionClients.set(client.sessionId, new Set());
    }
    this.sessionClients.get(client.sessionId)!.add(client.socketId);
  }

  removeClient(socketId: string): void {
    const client = this.clients.get(socketId);
    if (client) {
      this.sessionClients.get(client.sessionId)?.delete(socketId);
      this.clients.delete(socketId);
    }
  }

  getClient(socketId: string): ConnectedClient | undefined {
    return this.clients.get(socketId);
  }

  getSessionClients(sessionId: string): ConnectedClient[] {
    const socketIds = this.sessionClients.get(sessionId);
    if (!socketIds) return [];

    return Array.from(socketIds)
      .map((id) => this.clients.get(id))
      .filter((c): c is ConnectedClient => c !== undefined);
  }

  getHostSocketId(sessionId: string): string | undefined {
    const clients = this.getSessionClients(sessionId);
    return clients.find((c) => c.isHost)?.socketId;
  }

  async recordConnection(
    sessionId: string,
    userId: string,
    codeUsed: string,
  ): Promise<Connection> {
    const connection = this.connectionsRepository.create({
      sessionId,
      userId,
      codeUsed,
    });
    return this.connectionsRepository.save(connection);
  }
}
```

**Step 2: Create relay gateway**

Create `src/relay/relay.gateway.ts`:
```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RelayService } from './relay.service';
import { CodesService } from '../codes/codes.service';
import { SessionsService } from '../sessions/sessions.service';

interface JoinHostPayload {
  token: string;
  sessionId: string;
}

interface JoinGuestPayload {
  token: string;
  code: string;
  guestPublicKey: string;
}

interface RelayPayload {
  encryptedData: string;
  nonce: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/relay',
})
export class RelayGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private relayService: RelayService,
    private codesService: CodesService,
    private sessionsService: SessionsService,
  ) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const clientData = this.relayService.getClient(client.id);
    if (clientData) {
      // Notify others in session
      const sessionClients = this.relayService.getSessionClients(
        clientData.sessionId,
      );
      sessionClients.forEach((c) => {
        if (c.socketId !== client.id) {
          this.server.to(c.socketId).emit('peerDisconnected', {
            userId: clientData.userId,
            isHost: clientData.isHost,
          });
        }
      });

      this.relayService.removeClient(client.id);
    }
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinAsHost')
  async handleJoinAsHost(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinHostPayload,
  ) {
    try {
      const decoded = this.jwtService.verify(payload.token);
      const session = await this.sessionsService.findById(payload.sessionId);

      if (!session || session.hostUserId !== decoded.sub) {
        return { error: 'Unauthorized' };
      }

      this.relayService.addClient({
        socketId: client.id,
        userId: decoded.sub,
        sessionId: payload.sessionId,
        permission: 'control',
        isHost: true,
      });

      client.join(payload.sessionId);

      return { success: true };
    } catch (e) {
      return { error: 'Invalid token' };
    }
  }

  @SubscribeMessage('joinAsGuest')
  async handleJoinAsGuest(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinGuestPayload,
  ) {
    try {
      const decoded = this.jwtService.verify(payload.token);
      const validation = await this.codesService.validate(payload.code);

      if (!validation.valid) {
        return { error: validation.error };
      }

      const session = validation.session!;
      const permission = validation.permission!;

      // Increment code usage
      await this.codesService.incrementUsage(payload.code);

      // Record connection
      await this.relayService.recordConnection(
        session.id,
        decoded.sub,
        payload.code,
      );

      this.relayService.addClient({
        socketId: client.id,
        userId: decoded.sub,
        sessionId: session.id,
        permission,
        isHost: false,
      });

      client.join(session.id);

      // Notify host of new guest
      const hostSocketId = this.relayService.getHostSocketId(session.id);
      if (hostSocketId) {
        this.server.to(hostSocketId).emit('guestJoined', {
          guestPublicKey: payload.guestPublicKey,
          userId: decoded.sub,
          permission,
        });
      }

      return {
        success: true,
        hostPublicKey: session.hostPublicKey,
        permission,
      };
    } catch (e) {
      return { error: 'Invalid token' };
    }
  }

  @SubscribeMessage('relay')
  handleRelay(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RelayPayload,
  ) {
    const clientData = this.relayService.getClient(client.id);
    if (!clientData) {
      return { error: 'Not connected to a session' };
    }

    // Check permission for input
    if (!clientData.isHost && clientData.permission === 'read') {
      return { error: 'Read-only permission' };
    }

    // Relay to all others in the session
    const sessionClients = this.relayService.getSessionClients(
      clientData.sessionId,
    );

    sessionClients.forEach((c) => {
      if (c.socketId !== client.id) {
        this.server.to(c.socketId).emit('relayData', {
          from: clientData.isHost ? 'host' : 'guest',
          encryptedData: payload.encryptedData,
          nonce: payload.nonce,
        });
      }
    });

    return { success: true };
  }

  @SubscribeMessage('keyExchange')
  handleKeyExchange(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { targetUserId: string; publicKey: string },
  ) {
    const clientData = this.relayService.getClient(client.id);
    if (!clientData) {
      return { error: 'Not connected' };
    }

    const sessionClients = this.relayService.getSessionClients(
      clientData.sessionId,
    );
    const target = sessionClients.find((c) => c.userId === payload.targetUserId);

    if (target) {
      this.server.to(target.socketId).emit('keyExchange', {
        fromUserId: clientData.userId,
        publicKey: payload.publicKey,
      });
    }

    return { success: true };
  }
}
```

**Step 3: Create relay module**

Create `src/relay/relay.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RelayGateway } from './relay.gateway';
import { RelayService } from './relay.service';
import { CodesModule } from '../codes/codes.module';
import { SessionsModule } from '../sessions/sessions.module';
import { Connection } from '../entities/connection.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Connection]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('jwt.secret'),
      }),
    }),
    CodesModule,
    SessionsModule,
  ],
  providers: [RelayGateway, RelayService],
})
export class RelayModule {}
```

**Step 4: Add to app.module.ts**

```typescript
import { RelayModule } from './relay/relay.module';

@Module({
  imports: [
    // ... existing
    RelayModule,
  ],
})
export class AppModule {}
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add WebSocket relay gateway for session data"
```

---

## Phase 5: Billing

### Task 8: Billing Module

**Files:**
- Create: `src/billing/billing.module.ts`
- Create: `src/billing/billing.controller.ts`
- Create: `src/billing/billing.service.ts`
- Modify: `src/app.module.ts`
- Modify: `src/main.ts` (for raw body parsing)

**Step 1: Update main.ts for raw body parsing**

Modify `src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  // Enable CORS
  app.enableCors();

  // Raw body for Stripe webhooks
  app.use('/billing/webhook', bodyParser.raw({ type: 'application/json' }));

  await app.listen(3000);
}
bootstrap();
```

**Step 2: Install body-parser**

```bash
npm install body-parser
npm install -D @types/body-parser
```

**Step 3: Create billing service**

Create `src/billing/billing.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User } from '../entities/user.entity';

@Injectable()
export class BillingService {
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {
    this.stripe = new Stripe(this.configService.get('stripe.secretKey')!, {
      apiVersion: '2023-10-16',
    });
  }

  async createCheckoutSession(user: User): Promise<{ url: string }> {
    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await this.usersRepository.save(user);
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: user.id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: this.configService.get('stripe.priceId'),
          quantity: 1,
        },
      ],
      success_url: `${this.configService.get('app.frontendUrl')}billing/success`,
      cancel_url: `${this.configService.get('app.frontendUrl')}billing/cancel`,
    });

    return { url: session.url! };
  }

  async createPortalSession(user: User): Promise<{ url: string }> {
    if (!user.stripeCustomerId) {
      throw new Error('No Stripe customer found');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${this.configService.get('app.frontendUrl')}settings`,
    });

    return { url: session.url };
  }

  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.configService.get('stripe.webhookSecret');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret!,
      );
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.client_reference_id) {
          await this.upgradeUser(session.client_reference_id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.downgradeByCustomerId(subscription.customer as string);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
          await this.downgradeByCustomerId(subscription.customer as string);
        }
        break;
      }
    }
  }

  private async upgradeUser(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { tier: 'pro' });
  }

  private async downgradeByCustomerId(customerId: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { stripeCustomerId: customerId },
    });
    if (user && user.tier !== 'admin') {
      user.tier = 'free';
      await this.usersRepository.save(user);
    }
  }
}
```

**Step 4: Create billing controller**

Create `src/billing/billing.controller.ts`:
```typescript
import {
  Controller,
  Post,
  Get,
  Req,
  Headers,
  UseGuards,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { User } from '../entities/user.entity';

@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  createCheckout(@Req() req: { user: User }) {
    return this.billingService.createCheckoutSession(req.user);
  }

  @Get('portal')
  @UseGuards(JwtAuthGuard)
  createPortal(@Req() req: { user: User }) {
    return this.billingService.createPortalSession(req.user);
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    await this.billingService.handleWebhook(req.rawBody!, signature);
    return { received: true };
  }
}
```

**Step 5: Create billing module**

Create `src/billing/billing.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { User } from '../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
```

**Step 6: Add to app.module.ts**

```typescript
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    // ... existing
    BillingModule,
  ],
})
export class AppModule {}
```

**Step 7: Commit**

```bash
git add .
git commit -m "feat: add Stripe billing for Pro subscriptions"
```

---

## Phase 6: Health & Deployment

### Task 9: Health Check Endpoint

**Files:**
- Create: `src/health/health.controller.ts`
- Modify: `src/app.module.ts`

**Step 1: Create health controller**

Create `src/health/health.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Controller('health')
export class HealthController {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  @Get()
  async check() {
    // Simple database check
    try {
      await this.usersRepository.count();
      return { status: 'ok', timestamp: new Date().toISOString() };
    } catch (e) {
      return { status: 'error', message: 'Database connection failed' };
    }
  }
}
```

**Step 2: Add to app.module.ts**

```typescript
import { HealthController } from './health/health.controller';
import { User } from './entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    // ... existing
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add health check endpoint"
```

---

### Task 10: Docker Configuration

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `Caddyfile`
- Create: `.dockerignore`

**Step 1: Create Dockerfile**

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main"]
```

**Step 2: Create .dockerignore**

Create `.dockerignore`:
```
node_modules
dist
.env
.git
*.md
```

**Step 3: Create docker-compose.yml**

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  relay:
    build: .
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://relay:${DB_PASSWORD}@postgres:5432/relay
      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - GITHUB_CALLBACK_URL=${GITHUB_CALLBACK_URL}
      - JWT_SECRET=${JWT_SECRET}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - STRIPE_PRICE_ID=${STRIPE_PRICE_ID}
      - APP_URL=${APP_URL}
      - FRONTEND_URL=${FRONTEND_URL}
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=relay
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=relay

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

volumes:
  pgdata:
  caddy_data:
```

**Step 4: Create Caddyfile**

Create `Caddyfile`:
```
api.sytanek.tech {
    reverse_proxy relay:3000
}
```

**Step 5: Create production .env.example**

Update `.env.example` with production values noted:
```env
# Database
DB_PASSWORD=generate_secure_password

# GitHub OAuth (create at https://github.com/settings/developers)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=https://api.sytanek.tech/auth/github/callback

# JWT (generate with: openssl rand -base64 32)
JWT_SECRET=your_jwt_secret_min_32_chars

# Stripe (from https://dashboard.stripe.com)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID=price_xxx

# App URLs
APP_URL=https://api.sytanek.tech
FRONTEND_URL=claudelander://
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add Docker and Caddy deployment configuration"
```

---

### Task 11: Final Cleanup and Push

**Step 1: Create README**

Create `README.md`:
```markdown
# ClaudeLander Relay Server

Relay server for ClaudeLander session sharing. Enables E2E encrypted live session collaboration.

## Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Start PostgreSQL (or use docker-compose)
docker-compose up postgres -d

# Run in development
npm run start:dev
```

## Deployment

```bash
# On your VPS
git clone https://github.com/William-Long-II/claudelander-relay.git
cd claudelander-relay
cp .env.example .env
# Edit .env with production values

# Deploy
docker-compose up -d --build
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/auth/github` | Start OAuth flow |
| GET | `/auth/github/callback` | OAuth callback |
| GET | `/auth/me` | Get current user |
| POST | `/sessions` | Start sharing |
| DELETE | `/sessions/:id` | Stop sharing |
| POST | `/sessions/:id/codes` | Generate share code |
| GET | `/codes/:code/validate` | Validate code |
| DELETE | `/codes/:code` | Revoke code |
| POST | `/billing/checkout` | Create checkout session |
| GET | `/billing/portal` | Create portal session |
| WS | `/relay` | WebSocket relay |

## License

MIT
```

**Step 2: Final commit and push**

```bash
git add .
git commit -m "docs: add README"
git branch -M main
git push -u origin main
```

---

## Summary

This plan creates a complete NestJS relay server with:

1. **Auth**: GitHub OAuth + JWT tokens
2. **Sessions**: Share session lifecycle management
3. **Codes**: SYCLX-XXXXXX code generation with tier limits
4. **Relay**: WebSocket gateway for encrypted data relay
5. **Billing**: Stripe subscriptions for Pro tier
6. **Deployment**: Docker + Caddy with auto-SSL

Total: ~11 tasks, each with clear steps and commit points.
