import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

export class CreateVendorGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  description?: string | null

  // Bare strings, so the rules are per-element. No @ValidateNested and no @Type: those belong to
  // the route-group DTO, whose members are objects. A group with no vendors would be a permanently
  // empty column, hence ArrayMinSize(1). MaxLength(200) matches vendor_group_vendors.vendor so an
  // over-long name is a 400 rather than a database error.
  //
  // Nothing here trims or lowercases. The value that arrives is the value that gets stored, so it
  // stays byte-identical to v_pnl_to.vendor.
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(200, { each: true })
  vendors: string[]
}
