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
