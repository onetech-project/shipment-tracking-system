import { IsOptional, IsString, IsDateString } from 'class-validator'

export class AvailableToDto {
  @IsOptional()
  @IsString()
  origin?: string

  @IsOptional()
  @IsString()
  dest?: string

  @IsOptional()
  @IsDateString()
  date?: string

  @IsOptional()
  @IsString()
  search?: string

  /** When editing an existing Koli, include its own already-attached TOs (normally excluded) so they can be shown pre-selected. */
  @IsOptional()
  @IsString()
  koliId?: string
}
