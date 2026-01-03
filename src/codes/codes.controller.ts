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
import { CodesService } from './codes.service';
import { CreateCodeDto } from './dto/create-code.dto';
import { User } from '../entities/user.entity';

@Controller()
export class CodesController {
  constructor(private codesService: CodesService) {}

  @Post('sessions/:sessionId/codes')
  @UseGuards(JwtAuthGuard)
  create(
    @Param('sessionId') sessionId: string,
    @Req() req: { user: User },
    @Body() dto: CreateCodeDto,
  ) {
    return this.codesService.create(
      sessionId,
      req.user,
      dto.permission,
      dto.maxUses,
      dto.expiresInMinutes,
    );
  }

  @Get('sessions/:sessionId/codes')
  @UseGuards(JwtAuthGuard)
  getBySession(
    @Param('sessionId') sessionId: string,
    @Req() req: { user: User },
  ) {
    return this.codesService.getBySession(sessionId, req.user.id);
  }

  @Get('codes/:code/validate')
  validate(@Param('code') code: string) {
    return this.codesService.validate(code);
  }

  @Delete('codes/:code')
  @UseGuards(JwtAuthGuard)
  revoke(@Param('code') code: string, @Req() req: { user: User }) {
    return this.codesService.revoke(code, req.user.id);
  }
}
