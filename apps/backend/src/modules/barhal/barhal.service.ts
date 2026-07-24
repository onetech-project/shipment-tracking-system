import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { BarhalKoli } from './entities/barhal-koli.entity'
import { BarhalKoliTo } from './entities/barhal-koli-to.entity'
import { CreateBarhalKoliDto } from './dto/create-barhal-koli.dto'
import { ListBarhalKoliDto } from './dto/list-barhal-koli.dto'
import { AvailableToDto } from './dto/available-to.dto'
import { BarhalDashboardQueryDto } from './dto/barhal-dashboard-query.dto'
import { buildBarhalCsv, BarhalCsvRow } from './barhal-csv.builder'

export function normalizeStationName(raw: string | null | undefined): string {
  return (raw ?? '')
    .trim()
    .replace(/\s+DC$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
}

interface AvailableToRow {
  to_number: string
  awb: string | null
  gross_weight: number | null
  origin_station: string | null
  dest_station: string | null
  lt_number: string | null
  remarks: string | null
  date: string | null
  vendor: 'ESP'
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function koliDatePrefix(koliDate: string): string {
  const [year, month, day] = koliDate.split('-').map(Number)
  return `${String(day).padStart(2, '0')}${MONTH_ABBR[month - 1]}`
}

const UNIQUE_VIOLATION = '23505'

@Injectable()
export class BarhalService {
  constructor(
    @InjectRepository(BarhalKoli) private readonly koliRepo: Repository<BarhalKoli>,
    @InjectRepository(BarhalKoliTo) private readonly lineRepo: Repository<BarhalKoliTo>,
    private readonly dataSource: DataSource,
  ) {}

  /** Distinct normalized origin/destination names among Barhal-eligible TOs, for wizard/filter dropdowns. */
  async getStations(): Promise<{ origins: string[]; dests: string[] }> {
    const rows: { origin_station: string; dest_station: string }[] = await this.dataSource.query(`
      SELECT DISTINCT origin_station, dest_station
      FROM air_shipments_compileaircgk
      WHERE remarks ILIKE '%barhal%'
        AND origin_station IS NOT NULL AND origin_station != ''
        AND dest_station IS NOT NULL AND dest_station != ''
    `)
    const origins = new Set<string>()
    const dests = new Set<string>()
    for (const row of rows) {
      const origin = normalizeStationName(row.origin_station)
      const dest = normalizeStationName(row.dest_station)
      if (origin) origins.add(origin)
      if (dest) dests.add(dest)
    }
    return { origins: Array.from(origins).sort(), dests: Array.from(dests).sort() }
  }

  /** Barhal-only TOs (remarks ILIKE '%barhal%') not yet packed into any Koli. */
  async getAvailableTos(dto: AvailableToDto): Promise<AvailableToRow[]> {
    const params: unknown[] = []
    params.push('%barhal%')
    const conditions: string[] = [`c.remarks ILIKE $${params.length}`]

    if (dto.search) {
      params.push(`%${dto.search}%`)
      conditions.push(`(c.to_number ILIKE $${params.length} OR c.lt_number ILIKE $${params.length})`)
    }
    if (dto.date) {
      params.push(dto.date)
      conditions.push(`c.completed_date = $${params.length}`)
    }

    const rows: AvailableToRow[] = await this.dataSource.query(
      `
      SELECT
        c.to_number,
        c.awb,
        c.gross_weight,
        c.origin_station,
        c.dest_station,
        c.lt_number,
        c.remarks,
        c.completed_date AS date
      FROM air_shipments_compileaircgk c
      WHERE c.to_number IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = c.to_number)
        AND ${conditions.join(' AND ')}
      ORDER BY c.to_number
      `,
      params,
    )

    const filtered = rows.filter((row) => {
      if (dto.origin && normalizeStationName(row.origin_station) !== dto.origin) return false
      if (dto.dest && normalizeStationName(row.dest_station) !== dto.dest) return false
      return true
    })
    return filtered.map((row) => ({ ...row, vendor: 'ESP' as const }))
  }

  // TODO(task-6/8): still filters/paginates against the old `route` field shape; rewritten in a
  // later task. Cast to `any` purely to keep this file type-checking (Task 4 scope only).
  async listKoli(dtoIn: ListBarhalKoliDto) {
    const dto = dtoIn as any
    const page = dto.page ?? 1
    const pageSize = dto.pageSize ?? 25
    const qb = this.koliRepo
      .createQueryBuilder('k')
      .orderBy('k.koli_date', 'DESC')
      .addOrderBy('k.koli_number', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    if (dto.date) qb.andWhere('k.koli_date = :date', { date: dto.date })
    if (dto.route) qb.andWhere('k.route = :route', { route: dto.route })
    if (dto.search) {
      qb.andWhere(
        `(k.koli_number ILIKE :search OR EXISTS (
          SELECT 1 FROM barhal_koli_to bkt
          WHERE bkt.koli_id = k.id AND (bkt.to_number ILIKE :search OR bkt.smu_flight_number ILIKE :search)
        ))`,
        { search: `%${dto.search}%` },
      )
    }

    const [data, total] = await qb.getManyAndCount()
    return { data, total, page, pageSize }
  }

  async getKoliDetail(id: string): Promise<BarhalKoli> {
    const koli = await this.koliRepo.findOne({ where: { id }, relations: ['lines'] })
    if (!koli) throw new NotFoundException('Koli not found')
    return koli
  }

  // TODO(task-5): this method still references the pre-redesign DTO/row shape (route, toNumbers,
  // lengthCm/widthCm/heightCm, smu_* per-line fields) and is rewritten wholesale in Task 5.
  // `dto`/`toRows` are cast to `any` here purely so this file type-checks in the interim;
  // no behavior in this method changed as part of Task 4.
  async createKoli(dtoIn: CreateBarhalKoliDto, userId?: string): Promise<BarhalKoli> {
    const dto = dtoIn as any
    const packingKayuWeight = dto.packingKayuWeight ?? 0
    const [originCode, destCode] = dto.route.split(' - ').map((s: string) => s.trim())
    if (!originCode || !destCode) {
      throw new BadRequestException('route must be formatted as "ORIGIN - DEST"')
    }

    const toRows: any[] = await this.dataSource.query(
      `
      SELECT c.to_number, c.awb, c.gross_weight, c.origin_station, c.dest_station,
             s.account AS smu_account, s.airlines AS smu_airlines,
             s.flight_date AS smu_flight_date, s.flight_number AS smu_flight_number
      FROM air_shipments_compileaircgk c
      LEFT JOIN air_shipments_smu_rate_cgk_spx s ON s.awb = c.awb
      WHERE c.to_number = ANY($1)
      `,
      [dto.toNumbers],
    )
    if (toRows.length !== dto.toNumbers.length) {
      throw new BadRequestException('One or more selected TOs could not be found')
    }

    const weightBefore = toRows.reduce((sum, row) => sum + Number(row.gross_weight ?? 0), 0)
    const weightAfter = weightBefore + packingKayuWeight
    const volume =
      dto.lengthCm != null && dto.widthCm != null && dto.heightCm != null
        ? dto.lengthCm * dto.widthCm * dto.heightCm
        : null
    const datePrefix = koliDatePrefix(dto.koliDate)

    const maxAttempts = 5
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.dataSource.transaction(async (manager) => {
          // Serializes Koli-number generation for the same (date, route) pair only.
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${dto.koliDate}|${dto.route}`])

          const { count } = (
            await manager.query(
              `SELECT COUNT(*)::int AS count FROM barhal_koli WHERE koli_date = $1 AND route = $2`,
              [dto.koliDate, dto.route],
            )
          )[0]
          const sequenceNo = count + 1
          const koliNumber = `${datePrefix}-${originCode}-${destCode}-Barhal${sequenceNo}`

          const koli = manager.create(BarhalKoli, {
            koli_number: koliNumber,
            koli_date: dto.koliDate,
            route: dto.route,
            origin_code: originCode,
            dest_code: destCode,
            sequence_no: sequenceNo,
            weight_before: weightBefore,
            packing_kayu_weight: packingKayuWeight,
            weight_after: weightAfter,
            length_cm: dto.lengthCm ?? null,
            width_cm: dto.widthCm ?? null,
            height_cm: dto.heightCm ?? null,
            volume,
            total_to: toRows.length,
            created_by: userId ?? null,
          })
          await manager.save(koli)

          const lines = toRows.map((row) =>
            manager.create(BarhalKoliTo, {
              koli_id: koli.id,
              to_number: row.to_number,
              awb: row.awb,
              gross_weight: row.gross_weight,
              smu_account: row.smu_account,
              smu_airlines: row.smu_airlines,
              smu_flight_date: row.smu_flight_date,
              smu_flight_number: row.smu_flight_number,
            }),
          )
          await manager.save(lines)

          return koli
        })
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code
        if (code === UNIQUE_VIOLATION) {
          const detail = (err as { detail?: string })?.detail ?? ''
          if (detail.includes('to_number')) {
            throw new ConflictException('One or more selected TOs were already packed into another Koli')
          }
          if (attempt < maxAttempts - 1) continue // koli_number/sequence race — retry with a fresh count
          throw new ConflictException('Could not generate a unique Koli number, please retry')
        }
        throw err
      }
    }
    throw new ConflictException('Could not generate a unique Koli number, please retry')
  }

  // TODO(task-6): still filters by the old `route` field; rewritten to origin/dest in Task 6.
  // Cast to `any` purely to keep this file type-checking in the interim (Task 4 scope only).
  async getDashboard(dtoIn: BarhalDashboardQueryDto) {
    const dto = dtoIn as any
    const params: unknown[] = []
    const conditions: string[] = []
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      conditions.push(`k.koli_date BETWEEN $${params.length - 1} AND $${params.length}`)
    }
    if (dto.route) {
      params.push(dto.route)
      conditions.push(`k.route = $${params.length}`)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const totals = (
      await this.dataSource.query(
        `
        SELECT
          COUNT(*)::int AS koli_count,
          COALESCE(SUM(k.total_to), 0)::int AS total_to,
          COALESCE(SUM(k.weight_before), 0)::numeric AS weight_before,
          COALESCE(SUM(k.weight_after), 0)::numeric AS weight_after
        FROM barhal_koli k
        ${where}
        `,
        params,
      )
    )[0]

    const perRoute = await this.dataSource.query(
      `
      SELECT
        k.route,
        COUNT(*)::int AS koli_count,
        COALESCE(SUM(k.weight_before), 0)::numeric AS weight_before,
        COALESCE(SUM(k.weight_after), 0)::numeric AS weight_after,
        COALESCE(SUM(l.chwt), 0)::numeric AS chwt
      FROM barhal_koli k
      LEFT JOIN (
        SELECT bkt.koli_id, SUM(s.chwt) AS chwt
        FROM barhal_koli_to bkt
        LEFT JOIN air_shipments_smu_rate_cgk_spx s ON s.awb = bkt.awb
        GROUP BY bkt.koli_id
      ) l ON l.koli_id = k.id
      ${where}
      GROUP BY k.route
      ORDER BY k.route
      `,
      params,
    )

    const drillDown = await this.dataSource.query(
      `
      SELECT k.koli_date, k.route,
             COUNT(*)::int AS koli_count,
             COALESCE(SUM(k.weight_before), 0)::numeric AS weight_before,
             COALESCE(SUM(k.weight_after), 0)::numeric AS weight_after
      FROM barhal_koli k
      ${where}
      GROUP BY k.koli_date, k.route
      ORDER BY k.koli_date DESC, k.route
      `,
      params,
    )

    return { totals, perRoute, drillDown }
  }

  // TODO(task-7): still filters by the old `route` field; rewritten to origin/dest in Task 7.
  // Cast to `any` purely to keep this file type-checking in the interim (Task 4 scope only).
  async exportCsv(dtoIn: BarhalDashboardQueryDto): Promise<string> {
    const dto = dtoIn as any
    const params: unknown[] = []
    const conditions: string[] = []
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      conditions.push(`k.koli_date BETWEEN $${params.length - 1} AND $${params.length}`)
    }
    if (dto.route) {
      params.push(dto.route)
      conditions.push(`k.route = $${params.length}`)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows: (BarhalCsvRow & { koli_date: string })[] = await this.dataSource.query(
      `
      SELECT
        k.koli_number  AS "koliNumber",
        k.koli_date    AS "koliDate",
        k.route        AS "route",
        k.total_to     AS "totalTo",
        k.weight_before::numeric AS "weightBefore",
        k.weight_after::numeric  AS "weightAfter",
        COALESCE((
          SELECT SUM(s.chwt) FROM barhal_koli_to bkt
          LEFT JOIN air_shipments_smu_rate_cgk_spx s ON s.awb = bkt.awb
          WHERE bkt.koli_id = k.id
        ), 0)::numeric AS "chwt"
      FROM barhal_koli k
      ${where}
      ORDER BY k.koli_date DESC, k.koli_number DESC
      `,
      params,
    )
    return buildBarhalCsv(rows)
  }
}
