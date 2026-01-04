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

    // Manually authenticate with passport
    const authenticate = AuthGuard('github');
    const guard = new (authenticate as any)();

    return new Promise((resolve, reject) => {
      const next = (err?: any) => {
        if (err) {
          this.logger.error('GitHub auth error:', err);
          this.logger.error(`Error message: ${err.message}`);
          this.logger.error(`Error stack: ${err.stack}`);
          if (err.oauthError) {
            this.logger.error(`OAuth error data: ${JSON.stringify(err.oauthError)}`);
          }
          reject(
            new HttpException(
              `GitHub authentication failed: ${err.message}`,
              HttpStatus.INTERNAL_SERVER_ERROR,
            ),
          );
          return;
        }

        this.handleSuccessfulAuth(req, res)
          .then(resolve)
          .catch((authErr) => {
            this.logger.error('Post-auth error:', authErr);
            reject(authErr);
          });
      };

      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => res,
        }),
        getHandler: () => this.githubCallback,
        getClass: () => AuthController,
      } as any).then((result: boolean) => {
        if (result) {
          next();
        } else {
          next(new Error('Authentication failed'));
        }
      }).catch(next);
    });
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
