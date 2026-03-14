import { IsEmail, IsUUID, IsOptional } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;
}

export class AcceptInvitationDto {
  token: string;
}
