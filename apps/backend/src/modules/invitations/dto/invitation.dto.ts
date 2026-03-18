import {
  IsEmail,
  IsUUID,
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
} from 'class-validator'

export class CreateInvitationDto {
  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string

  @IsOptional()
  @IsUUID()
  roleId?: string

  @IsOptional()
  @IsUUID()
  organizationId?: string
}

export class AcceptInvitationDto {
  @IsString()
  @IsNotEmpty()
  token: string

  @IsString()
  @IsNotEmpty()
  username: string

  @IsString()
  @MinLength(8)
  password: string
}
