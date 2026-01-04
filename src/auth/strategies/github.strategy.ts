import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('github.clientId')!,
      clientSecret: configService.get<string>('github.clientSecret')!,
      callbackURL: configService.get<string>('github.callbackUrl')!,
      scope: ['user:email'],
    });
  }

  // This is only used if passport handles the callback (we don't use it)
  async validate(
    accessToken: string,
    _refreshToken: string,
    profile: any,
  ): Promise<any> {
    return {
      id: profile.id,
      username: profile.username,
      emails: profile.emails,
    };
  }
}
