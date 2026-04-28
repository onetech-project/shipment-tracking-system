import { IsString, IsNotEmpty } from 'class-validator'

export class UpdateGeneralParamDto {
  @IsString()
  @IsNotEmpty()
  value: string
}
