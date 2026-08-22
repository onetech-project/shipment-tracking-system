import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

export class UpdateVendorGroupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  // Nullable rather than merely optional: `null` clears the description, an absent field leaves it
  // alone. The service depends on being able to tell those two apart.
  @IsOptional()
  @IsString()
  description?: string | null

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(200, { each: true })
  vendors?: string[]
}
