import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { User } from '../entities/user.entity';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private sessionsService: SessionsService) {}

  @Post()
  create(@Req() req: { user: User }, @Body() dto: CreateSessionDto) {
    return this.sessionsService.create(req.user, dto.hostPublicKey, dto.sessionName);
  }

  @Get()
  getActive(@Req() req: { user: User }) {
    return this.sessionsService.getActiveSessions(req.user.id);
  }

  @Delete(':id')
  end(@Param('id') id: string, @Req() req: { user: User }) {
    return this.sessionsService.end(id, req.user.id);
  }
}
