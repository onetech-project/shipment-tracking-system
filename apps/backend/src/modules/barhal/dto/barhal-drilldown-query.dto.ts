import { IsIn } from 'class-validator'
import { BarhalDashboardQueryDto } from './barhal-dashboard-query.dto'

/**
 * Identitas baris yang diklik dilebur ke parameter filter yang sudah ada:
 * - groupBy='route' → pemanggil menyetel startDate=endDate=<tanggal baris>
 * - groupBy='date'  → pemanggil menyetel origin/dest=<rute baris>
 */
export class BarhalDrilldownQueryDto extends BarhalDashboardQueryDto {
  @IsIn(['route', 'date'])
  groupBy!: 'route' | 'date'
}
