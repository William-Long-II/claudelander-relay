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
