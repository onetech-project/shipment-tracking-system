import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class LinehaulTripItemDto {
  @IsString()
  @IsNotEmpty()
  toNumber: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  weight?: number | null;

  @IsOptional()
  @IsString()
  destination?: string | null;

  @IsOptional()
  @IsString()
  dgType?: string | null;

  @IsOptional()
  @IsString()
  toType?: string | null;
}
