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

  @Get('debug')
  debugConfig() {
    const config = {
      clientId: this.configService.get<string>('github.clientId'),
      clientSecretLength: this.configService.get<string>('github.clientSecret')?.length,
      callbackUrl: this.configService.get<string>('github.callbackUrl'),
      frontendUrl: this.configService.get('app.frontendUrl'),
    };
    this.logger.log(`Debug config: ${JSON.stringify(config)}`);
    return config;
  }

  // Manual token exchange to see raw GitHub response
  @Get('test-exchange')
  async testExchange(@Req() req: Request) {
    const code = req.query.code as string;
    if (!code) {
      return { error: 'No code provided. Add ?code=YOUR_CODE' };
    }

    const clientId = this.configService.get<string>('github.clientId')!;
    const clientSecret = this.configService.get<string>('github.clientSecret')!;
    const callbackUrl = this.configService.get<string>('github.callbackUrl')!;

    this.logger.log(`Manual token exchange for code: ${code}`);
    this.logger.log(`Using client_id: ${clientId}`);
    this.logger.log(`Using redirect_uri: ${callbackUrl}`);

    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
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

      const data = await response.json();
      this.logger.log(`GitHub response: ${JSON.stringify(data)}`);
      return {
        status: response.status,
        data: data,
      };
    } catch (err: any) {
      this.logger.error(`Fetch error: ${err.message}`);
      return { error: err.message };
    }
  }

  @Get('github/callback')
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    this.logger.log('GitHub callback received');
    this.logger.log(`Query params: ${JSON.stringify(req.query)}`);

    // Check for OAuth error in query params
    if (req.query.error) {
      this.logger.error(`GitHub OAuth error: ${req.query.error}`);
      this.logger.error(`Error description: ${req.query.error_description}`);
      throw new HttpException(
        `GitHub OAuth error: ${req.query.error_description || req.query.error}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const code = req.query.code as string;
    if (!code) {
      throw new HttpException('No authorization code received', HttpStatus.BAD_REQUEST);
    }

    // Manual token exchange to see raw GitHub response
    const clientId = this.configService.get<string>('github.clientId')!;
    const clientSecret = this.configService.get<string>('github.clientSecret')!;
    const callbackUrl = this.configService.get<string>('github.callbackUrl')!;

    this.logger.log(`Attempting manual token exchange...`);
    this.logger.log(`client_id: ${clientId}`);
    this.logger.log(`redirect_uri: ${callbackUrl}`);
    this.logger.log(`code length: ${code.length}`);

    try {
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
      this.logger.log(`GitHub token response: ${JSON.stringify(tokenData)}`);

      if (tokenData.error) {
        this.logger.error(`GitHub error: ${tokenData.error}`);
        this.logger.error(`GitHub error_description: ${tokenData.error_description}`);
        throw new HttpException(
          `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const accessToken = tokenData.access_token;
      this.logger.log(`Access token obtained (length: ${accessToken?.length})`);

      // Fetch user profile
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ClaudeLander-Relay',
        },
      });

      const userData = await userResponse.json();
      this.logger.log(`GitHub user: ${userData.login} (ID: ${userData.id})`);

      // Fetch user emails
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ClaudeLander-Relay',
        },
      });

      const emailsData = await emailsResponse.json();
      this.logger.log(`GitHub emails: ${JSON.stringify(emailsData)}`);

      // Validate user with our auth service
      const user = await this.authService.validateGitHubUser({
        id: userData.id.toString(),
        username: userData.login,
        emails: emailsData,
      });

      // Generate JWT
      const jwt = await this.authService.login(user);
      const frontendUrl = this.configService.get('app.frontendUrl');
      this.logger.log(`Redirecting to: ${frontendUrl}auth?token=...`);
      res.redirect(`${frontendUrl}auth?token=${jwt.accessToken}`);

    } catch (err: any) {
      this.logger.error(`Token exchange error: ${err.message}`);
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException(
        `GitHub authentication failed: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async handleSuccessfulAuth(req: any, res: Response) {
    this.logger.log('GitHub auth successful, generating JWT');
    const { accessToken } = await this.authService.login(req.user);
    const frontendUrl = this.configService.get('app.frontendUrl');
    this.logger.log(`Redirecting to: ${frontendUrl}auth?token=...`);
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
