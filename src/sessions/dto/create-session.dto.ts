import { IsString, IsOptional } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  hostPublicKey: string;

  @IsString()
  @IsOptional()
  sessionName?: string;
}
