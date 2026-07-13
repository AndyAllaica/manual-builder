import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(120)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;
}
