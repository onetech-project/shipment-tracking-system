import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsNotEmpty, IsString, ValidateNested } from 'class-validator'

export class SlaColumnLayoutItemDto {
  @IsString()
  @IsNotEmpty()
  key: string

  @IsBoolean()
  visible: boolean

  @IsBoolean()
  frozen: boolean
}

export class SlaColumnLayoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SlaColumnLayoutItemDto)
  layout: SlaColumnLayoutItemDto[]
}
