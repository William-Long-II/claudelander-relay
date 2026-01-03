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
