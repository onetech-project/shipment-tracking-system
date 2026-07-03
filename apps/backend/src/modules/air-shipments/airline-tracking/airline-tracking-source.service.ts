import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { CreateAirlineSourceDto, UpdateAirlineSourceDto } from './dto/airline-source.dto'

export interface AirlineSource {
  carrier_code: string
  name: string | null
  url: string
  payload: Record<string, string>
  enabled: boolean
}

/**
 * CRUD + reads for the `airline_tracking_source` registry. Adding a new airline is
 * just inserting a row (carrier_code, url, payload) — no code change required.
 */
@Injectable()
export class AirlineTrackingSourceService {
  private readonly logger = new Logger(AirlineTrackingSourceService.name)

  constructor(private readonly dataSource: DataSource) {}

  async list(): Promise<AirlineSource[]> {
    return this.dataSource.query(
      `SELECT carrier_code, name, url, payload, enabled FROM airline_tracking_source ORDER BY carrier_code`
    )
  }

  async getEnabled(): Promise<AirlineSource[]> {
    return this.dataSource.query(
      `SELECT carrier_code, name, url, payload, enabled FROM airline_tracking_source WHERE enabled = true`
    )
  }

  async getByCarrier(carrierCode: string): Promise<AirlineSource | null> {
    const rows: AirlineSource[] = await this.dataSource.query(
      `SELECT carrier_code, name, url, payload, enabled FROM airline_tracking_source WHERE carrier_code = $1`,
      [carrierCode]
    )
    return rows[0] ?? null
  }

  async create(dto: CreateAirlineSourceDto): Promise<AirlineSource> {
    const existing = await this.getByCarrier(dto.carrierCode)
    if (existing) throw new BadRequestException(`Carrier ${dto.carrierCode} already exists`)
    await this.dataSource.query(
      `INSERT INTO airline_tracking_source (carrier_code, name, url, payload, enabled)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        dto.carrierCode,
        dto.name ?? null,
        dto.url,
        JSON.stringify(dto.payload ?? {}),
        dto.enabled ?? true,
      ]
    )
    return (await this.getByCarrier(dto.carrierCode))!
  }

  async update(carrierCode: string, dto: UpdateAirlineSourceDto): Promise<AirlineSource> {
    const existing = await this.getByCarrier(carrierCode)
    if (!existing) throw new NotFoundException(`Carrier ${carrierCode} not found`)

    const sets: string[] = []
    const params: unknown[] = []
    const push = (col: string, val: unknown, cast = '') => {
      sets.push(`${col} = $${params.length + 1}${cast}`)
      params.push(val)
    }
    if (dto.name !== undefined) push('name', dto.name)
    if (dto.url !== undefined) push('url', dto.url)
    if (dto.payload !== undefined) push('payload', JSON.stringify(dto.payload), '::jsonb')
    if (dto.enabled !== undefined) push('enabled', dto.enabled)
    if (sets.length === 0) return existing
    sets.push(`updated_at = now()`)

    params.push(carrierCode)
    await this.dataSource.query(
      `UPDATE airline_tracking_source SET ${sets.join(', ')} WHERE carrier_code = $${params.length}`,
      params
    )
    return (await this.getByCarrier(carrierCode))!
  }

  async remove(carrierCode: string): Promise<void> {
    const res = await this.dataSource.query(
      `DELETE FROM airline_tracking_source WHERE carrier_code = $1`,
      [carrierCode]
    )
    // node-postgres returns affected count via the second element on some drivers; tolerate either.
    if (Array.isArray(res) && res[1] === 0) {
      throw new NotFoundException(`Carrier ${carrierCode} not found`)
    }
  }
}
