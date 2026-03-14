import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsUUID()
  organizationId: string;
}
