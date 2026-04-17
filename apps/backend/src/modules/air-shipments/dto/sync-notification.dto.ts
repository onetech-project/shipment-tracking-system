import { IsArray, IsDateString, IsNumber, IsString, IsOptional } from 'class-validator';

export class SyncNotificationDto {
  @IsArray()
  @IsString({ each: true })
  affectedTables!: string[];

  @IsNumber()
  totalUpserted!: number;

  @IsDateString()
  syncedAt!: string;

  @IsOptional()
  @IsString()
  spreadsheetLabel?: string
}
