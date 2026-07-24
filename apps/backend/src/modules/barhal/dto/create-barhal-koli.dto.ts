import { IsDateString, IsString } from 'class-validator'

export class CreateBarhalKoliDto {
  @IsDateString()
  koliDate: string

  @IsString()
  origin: string

  @IsString()
  dest: string
}
