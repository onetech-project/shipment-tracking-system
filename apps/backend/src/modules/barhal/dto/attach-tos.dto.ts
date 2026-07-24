import { IsArray, ArrayNotEmpty, IsString } from 'class-validator'

export class AttachTosDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  toNumbers: string[]
}
