import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { User } from '../entities/user.entity';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Get('github')
  @UseGuards(AuthGuard('github'))
  githubAuth() {
    // Initiates GitHub OAuth flow - guard redirects to GitHub
  }

  @Get('github/callback')
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    // Check for OAuth error in query params
    if (req.query.error) {
      this.logger.error(`GitHub OAuth error: ${req.query.error_description || req.query.error}`);
      throw new HttpException(
        `GitHub OAuth error: ${req.query.error_description || req.query.error}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const code = req.query.code as string;
    if (!code) {
      throw new HttpException('No authorization code received', HttpStatus.BAD_REQUEST);
    }

    const clientId = this.configService.get<string>('github.clientId')!;
    const clientSecret = this.configService.get<string>('github.clientSecret')!;
    const callbackUrl = this.configService.get<string>('github.callbackUrl')!;

    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: callbackUrl,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        this.logger.error(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`);
        throw new HttpException(
          `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const accessToken = tokenData.access_token;

      // Fetch user profile
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ClaudeLander-Relay',
        },
      });

      const userData = await userResponse.json();

      // Fetch user emails
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ClaudeLander-Relay',
        },
      });

      const emailsData = await emailsResponse.json();

      // Validate user with our auth service
      const user = await this.authService.validateGitHubUser({
        id: userData.id.toString(),
        username: userData.login,
        emails: emailsData,
      });

      // Generate JWT and redirect
      const jwt = await this.authService.login(user);
      const frontendUrl = this.configService.get('app.frontendUrl');
      res.redirect(`${frontendUrl}auth?token=${jwt.accessToken}`);

    } catch (err: any) {
      this.logger.error(`GitHub auth failed: ${err.message}`);
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException(
        `GitHub authentication failed: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
