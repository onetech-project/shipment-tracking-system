import { IsEmail, IsUUID, IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class AcceptInvitationDto {
  token: string;
}
