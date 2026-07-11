import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCaptureSessionDto {
  @IsUUID()
  actionId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  startedBy!: string;
}
