import { Type } from 'class-transformer'
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator'

export class FleetVehicleDocumentDto {
  @IsUUID()
  docTypeId: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nomor?: string | null

  // Calendar dates, not instants. The service stores them as-is into DATE columns.
  @IsOptional()
  @IsDateString()
  issuedAt?: string | null

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null
}

export class ReplaceFleetVehicleDocumentsDto {
  // @ValidateNested with @Type is what makes the rules above run at all. Without both, the array
  // is accepted as-is and every entry reaches the service unvalidated.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FleetVehicleDocumentDto)
  documents: FleetVehicleDocumentDto[]
}
