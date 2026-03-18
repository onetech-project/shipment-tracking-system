import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class ShipmentRowDto {
  @IsString()
  @IsNotEmpty()
  shipmentId: string;

  @IsString()
  @IsNotEmpty()
  origin: string;

  @IsString()
  @IsNotEmpty()
  destination: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsOptional()
  @IsString()
  carrier?: string | null;

  @IsOptional()
  @IsDateString()
  estimatedDeliveryDate?: string | null;

  @IsOptional()
  @IsString()
  contentsDescription?: string | null;
}
