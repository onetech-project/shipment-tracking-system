import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'

export class RouteGroupRouteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  origin: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  dest: string
}

export class CreateRouteGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  description?: string

  // A group with no routes would produce a permanently empty column in the comparison table.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RouteGroupRouteDto)
  routes: RouteGroupRouteDto[]
}
