import { IsArray, IsDateString, IsNumber, IsString } from 'class-validator';

export class SyncNotificationDto {
  @IsArray()
  @IsString({ each: true })
  affectedTables!: string[];

  @IsNumber()
  totalUpserted!: number;

  @IsDateString()
  syncedAt!: string;
}
