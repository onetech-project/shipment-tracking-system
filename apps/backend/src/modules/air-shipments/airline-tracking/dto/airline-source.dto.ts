import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, Matches } from 'class-validator'

export class CreateAirlineSourceDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9]+$/, { message: 'carrierCode must be alphanumeric' })
  carrierCode: string

  @IsOptional()
  @IsString()
  name?: string

  @IsString()
  @IsNotEmpty()
  url: string

  /** Query-param template, e.g. { "AWBNo": "{awbNo}", "CarrierCode": "{carrierCode}", ... } */
  @IsOptional()
  @IsObject()
  payload?: Record<string, string>

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class UpdateAirlineSourceDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  url?: string

  @IsOptional()
  @IsObject()
  payload?: Record<string, string>

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}
