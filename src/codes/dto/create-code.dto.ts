import { IsOptional, IsInt, IsIn, Min } from 'class-validator';

export class CreateCodeDto {
  @IsIn(['read', 'control'])
  permission: 'read' | 'control';

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInMinutes?: number;
}
