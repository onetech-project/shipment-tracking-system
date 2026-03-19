import { IsString, IsNotEmpty, IsOptional, Matches, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class LinehaulTripDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^LT\w+$/, { message: 'tripCode must match pattern LT followed by word characters' })
  tripCode: string;

  @IsOptional()
  @IsString()
  schedule?: string | null;

  @IsString()
  @IsNotEmpty()
  origin: string;

  @IsString()
  @IsNotEmpty()
  destination: string;

  @IsOptional()
  @IsString()
  vendor?: string | null;

  @IsOptional()
  @IsString()
  plateNumber?: string | null;

  @IsOptional()
  @IsString()
  driverName?: string | null;

  @IsOptional()
  @IsString()
  std?: string | null;

  @IsOptional()
  @IsString()
  sta?: string | null;

  @IsOptional()
  @IsString()
  ata?: string | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  totalWeight?: number | null;
}
