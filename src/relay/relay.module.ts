import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RelayGateway } from './relay.gateway';
import { RelayService } from './relay.service';
import { CodesModule } from '../codes/codes.module';
import { SessionsModule } from '../sessions/sessions.module';
import { Connection } from '../entities/connection.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Connection]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('jwt.secret'),
      }),
    }),
    CodesModule,
    SessionsModule,
  ],
  providers: [RelayGateway, RelayService],
})
export class RelayModule {}
