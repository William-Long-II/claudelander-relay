import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { AuthService } from '../auth.service';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GitHubStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const clientID = configService.get<string>('github.clientId')!;
    const clientSecret = configService.get<string>('github.clientSecret')!;
    const callbackURL = configService.get<string>('github.callbackUrl')!;

    console.log('GitHub OAuth Config:', {
      clientID,
      clientSecretLength: clientSecret?.length,
      callbackURL,
    });

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['user:email'],
      // Add custom user agent to help debug
      customHeaders: { 'User-Agent': 'ClaudeLander-Relay' },
    });

    // Log when strategy is initialized
    this.logger.log('GitHubStrategy initialized');
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
  ): Promise<any> {
    this.logger.log(`Validate called for user: ${profile.username}`);
    this.logger.log(`Access token received (length: ${accessToken?.length})`);

    return this.authService.validateGitHubUser({
      id: profile.id,
      username: profile.username,
      emails: profile.emails,
    });
  }

  // Override authenticate to add logging
  authenticate(req: any, options?: any): void {
    this.logger.log('authenticate() called');
    this.logger.log(`Request query: ${JSON.stringify(req.query)}`);

    if (req.query.code) {
      this.logger.log(`Authorization code received (length: ${req.query.code.length})`);
    }

    super.authenticate(req, options);
  }
}
