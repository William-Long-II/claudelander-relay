import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodesController } from './codes.controller';
import { CodesService } from './codes.service';
import { ShareCode } from '../entities/share-code.entity';
import { ShareSession } from '../entities/share-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShareCode, ShareSession])],
  controllers: [CodesController],
  providers: [CodesService],
  exports: [CodesService],
})
export class CodesModule {}
