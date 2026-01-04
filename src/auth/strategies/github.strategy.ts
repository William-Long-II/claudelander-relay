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
      clientID: configService.get<string>('github.clientId')!,
      clientSecret: configService.get<string>('github.clientSecret')!,
      callbackURL: configService.get<string>('github.callbackUrl')!,
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
