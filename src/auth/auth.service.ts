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
