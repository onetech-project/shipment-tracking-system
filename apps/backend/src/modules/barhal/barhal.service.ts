import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { BarhalKoli } from './entities/barhal-koli.entity'
import { BarhalKoliTo } from './entities/barhal-koli-to.entity'
import { CreateBarhalKoliDto } from './dto/create-barhal-koli.dto'
import { AttachTosDto } from './dto/attach-tos.dto'
import { ListBarhalKoliDto } from './dto/list-barhal-koli.dto'
import { AvailableToDto } from './dto/available-to.dto'
import { BarhalDashboardQueryDto } from './dto/barhal-dashboard-query.dto'
import { BarhalToDetailQueryDto } from './dto/barhal-to-detail-query.dto'
import { UpdatePackingDto } from './dto/update-packing.dto'
import { UpdateSmuDto } from './dto/update-smu.dto'
import { BulkUpdateSmuDto } from './dto/bulk-update-smu.dto'
import { SmuListQueryDto } from './dto/smu-list-query.dto'
import { buildBarhalCsv, BarhalCsvRow } from './barhal-csv.builder'
import {
  toRecapMetrics,
  densifyPerTanggal,
  daysInRange,
  MAX_RECAP_DAYS,
  RecapAggregateRow,
} from './barhal-recap.builder'

/**
 * Station names come from a manually-maintained Google Sheet, so the same real station
 * often appears with inconsistent casing/whitespace (e.g. "MAKASSAR" vs "Makassar").
 * Normalizing to a single title-cased form here (and via matching SQL in
 * normalizedStationSql) keeps filtering, koli grouping, and dropdown dedup consistent.
 */
export function normalizeStationName(raw: string | null | undefined): string {
  return (raw ?? '')
    .trim()
    .replace(/\s+DC$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
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

interface BarhalToDetailRow {
  date: string
  originName: string
  destName: string
  toNumber: string
  koliNumber: string | null
  grossWeight: number | null
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function koliDatePrefix(koliDate: string): string {
  const [year, month, day] = koliDate.split('-').map(Number)
  return `${day}${MONTH_ABBR[month - 1]}`
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

    let excludeAttachedClause = 'NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = c.to_number)'
    if (dto.koliId) {
      params.push(dto.koliId)
      excludeAttachedClause = `NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = c.to_number AND bkt.koli_id != $${params.length})`
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
        AND ${excludeAttachedClause}
        AND ${conditions.join(' AND ')}
      ORDER BY c.to_number
      `,
      params,
    )

    const originFilter = dto.origin ? normalizeStationName(dto.origin) : undefined
    const destFilter = dto.dest ? normalizeStationName(dto.dest) : undefined
    const filtered = rows.filter((row) => {
      if (originFilter && normalizeStationName(row.origin_station) !== originFilter) return false
      if (destFilter && normalizeStationName(row.dest_station) !== destFilter) return false
      return true
    })
    const AVAILABLE_TOS_LIMIT = 100
    return filtered.slice(0, AVAILABLE_TOS_LIMIT).map((row) => ({
      ...row,
      origin_station: row.origin_station ? normalizeStationName(row.origin_station) : row.origin_station,
      dest_station: row.dest_station ? normalizeStationName(row.dest_station) : row.dest_station,
      vendor: 'ESP' as const,
    }))
  }

  async listKoli(dto: ListBarhalKoliDto) {
    const page = dto.page ?? 1
    const pageSize = dto.pageSize ?? 25
    const qb = this.koliRepo
      .createQueryBuilder('k')
      .leftJoinAndSelect('k.lines', 'lines')
      .orderBy('k.koli_date', 'DESC')
      .addOrderBy('k.koli_number', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    if (dto.date) qb.andWhere('k.koli_date = :date', { date: dto.date })
    if (dto.origin) qb.andWhere('k.origin_name = :origin', { origin: dto.origin })
    if (dto.dest) qb.andWhere('k.dest_name = :dest', { dest: dto.dest })
    if (dto.search) {
      qb.andWhere(
        `(k.koli_number ILIKE :search OR EXISTS (
          SELECT 1 FROM barhal_koli_to bkt
          WHERE bkt.koli_id = k.id AND bkt.to_number ILIKE :search
        ) OR k.flight_no ILIKE :search)`,
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

  async createKoliShell(dto: CreateBarhalKoliDto, userId?: string): Promise<BarhalKoli> {
    const originName = normalizeStationName(dto.origin)
    const destName = normalizeStationName(dto.dest)
    if (!originName || !destName) {
      throw new BadRequestException('origin and dest must not be blank')
    }
    const datePrefix = koliDatePrefix(dto.koliDate)

    const maxAttempts = 5
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.dataSource.transaction(async (manager) => {
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `${dto.koliDate}|${originName}|${destName}`,
          ])
          const { count } = (
            await manager.query(
              `SELECT COUNT(*)::int AS count FROM barhal_koli WHERE koli_date = $1 AND origin_name = $2 AND dest_name = $3`,
              [dto.koliDate, originName, destName],
            )
          )[0]
          const sequenceNo = count + 1
          const koliNumber = `${datePrefix}-${originName}-${destName}-Barhal${sequenceNo}`

          const koli = manager.create(BarhalKoli, {
            koli_number: koliNumber,
            koli_date: dto.koliDate,
            origin_name: originName,
            dest_name: destName,
            komoditi: dto.komoditi,
            sequence_no: sequenceNo,
            weight_before: null,
            packing_kayu_weight: 0,
            weight_after: null,
            total_to: 0,
            created_by: userId ?? null,
          })
          return manager.save(koli)
        })
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code
        if (code === UNIQUE_VIOLATION && attempt < maxAttempts - 1) continue
        if (code === UNIQUE_VIOLATION) throw new ConflictException('Could not generate a unique Koli number, please retry')
        throw err
      }
    }
    throw new ConflictException('Could not generate a unique Koli number, please retry')
  }

  /** Replaces the Koli's full set of attached TOs with dto.toNumbers (may be empty to detach all). */
  async attachTos(id: string, dto: AttachTosDto): Promise<BarhalKoli> {
    const koli = await this.koliRepo.findOne({ where: { id } })
    if (!koli) throw new NotFoundException('Koli not found')

    const toRows: { to_number: string; awb: string | null; gross_weight: number | null }[] = dto.toNumbers.length
      ? await this.dataSource.query(
          `SELECT to_number, awb, gross_weight FROM air_shipments_compileaircgk WHERE to_number = ANY($1)`,
          [dto.toNumbers],
        )
      : []
    if (toRows.length !== dto.toNumbers.length) {
      throw new BadRequestException('One or more selected TOs could not be found')
    }

    try {
      await this.lineRepo.delete({ koli_id: id })
      if (toRows.length) {
        const lines = toRows.map((row) =>
          this.lineRepo.create({ koli_id: id, to_number: row.to_number, awb: row.awb, gross_weight: row.gross_weight }),
        )
        await this.lineRepo.save(lines)
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === UNIQUE_VIOLATION) throw new ConflictException('One or more selected TOs were already packed into another Koli')
      throw err
    }

    koli.weight_before = toRows.reduce((sum, row) => sum + Number(row.gross_weight ?? 0), 0)
    koli.total_to = toRows.length
    await this.koliRepo.save(koli)
    return (await this.koliRepo.findOne({ where: { id }, relations: ['lines'] }))!
  }

  async updatePacking(id: string, dto: UpdatePackingDto): Promise<BarhalKoli> {
    const koli = await this.koliRepo.findOne({ where: { id } })
    if (!koli) throw new NotFoundException('Koli not found')

    koli.weight_after = dto.weightAfter
    if (dto.lengthCm != null) koli.length_cm = dto.lengthCm
    if (dto.widthCm != null) koli.width_cm = dto.widthCm
    if (dto.heightCm != null) koli.height_cm = dto.heightCm
    if (dto.batangKayu != null) koli.batang_kayu = dto.batangKayu
    koli.volume =
      koli.length_cm != null && koli.width_cm != null && koli.height_cm != null
        ? (koli.length_cm * koli.width_cm * koli.height_cm) / 6000
        : koli.volume
    return this.koliRepo.save(koli)
  }

  private applySmuFields(koli: BarhalKoli, dto: UpdateSmuDto | BulkUpdateSmuDto): void {
    if (dto.smuNumber) koli.smu_number = dto.smuNumber
    if (dto.airlines) koli.airlines = dto.airlines
    if (dto.flightNo) koli.flight_no = dto.flightNo
    if (dto.std) koli.std = new Date(dto.std)
    if (dto.sta) koli.sta = new Date(dto.sta)
  }

  async updateSmu(id: string, dto: UpdateSmuDto): Promise<BarhalKoli> {
    const koli = await this.koliRepo.findOne({ where: { id } })
    if (!koli) throw new NotFoundException('Koli not found')
    this.applySmuFields(koli, dto)
    return this.koliRepo.save(koli)
  }

  async bulkUpdateSmu(dto: BulkUpdateSmuDto): Promise<{ updated: number }> {
    const destName = normalizeStationName(dto.dest)
    const kolis = await this.koliRepo.find({ where: { koli_date: dto.koliDate, dest_name: destName || dto.dest } })
    await this.dataSource.transaction(async (manager) => {
      for (const koli of kolis) {
        this.applySmuFields(koli, dto)
        await manager.save(BarhalKoli, koli)
      }
    })
    return { updated: kolis.length }
  }

  /** Permanently deletes a Koli and its attached TO lines (cascade), freeing those TOs back up. */
  async deleteKoli(id: string): Promise<void> {
    const koli = await this.koliRepo.findOne({ where: { id } })
    if (!koli) throw new NotFoundException('Koli not found')
    await this.koliRepo.delete({ id })
  }

  /** Clears SMU/flight fields from every Koli sharing smuNumber, without deleting the Koli records themselves. */
  async unassignSmu(smuNumber: string): Promise<{ updated: number }> {
    const kolis = await this.koliRepo.find({ where: { smu_number: smuNumber } })
    if (kolis.length === 0) throw new NotFoundException('SMU not found')
    await this.dataSource.transaction(async (manager) => {
      for (const koli of kolis) {
        koli.smu_number = null
        koli.airlines = null
        koli.flight_no = null
        koli.std = null
        koli.sta = null
        await manager.save(BarhalKoli, koli)
      }
    })
    return { updated: kolis.length }
  }

  async getSmuList(dto: SmuListQueryDto) {
    const params: unknown[] = []
    const conditions: string[] = [`k.smu_number IS NOT NULL`]
    if (dto.date) {
      params.push(dto.date)
      conditions.push(`k.koli_date = $${params.length}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`k.origin_name = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`k.dest_name = $${params.length}`)
    }
    const where = `WHERE ${conditions.join(' AND ')}`

    const rows = await this.dataSource.query(
      `
      SELECT
        k.smu_number AS "smuNumber",
        MIN(k.koli_date)::text AS date,
        MIN(k.origin_name) AS "originName",
        MIN(k.dest_name) AS "destName",
        COUNT(DISTINCT k.id)::int AS "totalKoli",
        COALESCE(SUM(k.total_to), 0)::int AS "totalTo",
        MIN(k.airlines) AS airlines,
        MIN(k.flight_no) AS "flightNo",
        MIN(k.std)::text AS std,
        MIN(k.sta)::text AS sta,
        (
          -- Assumption: SMU numbers are expected to be date/dest-specific in real usage.
          -- This chWt sum is NOT re-scoped by the outer query's date/origin/dest filters;
          -- it matches solely on smu_number, so if two Koli ever shared an SMU number
          -- across different dates/destinations, the sum would span all of them.
          SELECT SUM(r.chwt)
          FROM (
            SELECT DISTINCT bkt.awb
            FROM barhal_koli bk
            JOIN barhal_koli_to bkt ON bkt.koli_id = bk.id
            WHERE bk.smu_number = k.smu_number AND bkt.awb IS NOT NULL
          ) awbs
          LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb
        )::numeric AS chwt
      FROM barhal_koli k
      ${where}
      GROUP BY k.smu_number
      ORDER BY MIN(k.koli_date) DESC
      `,
      params,
    )

    return rows.map((row) => ({ ...row, chwt: row.chwt != null ? Number(row.chwt) : null }))
  }

  private normalizedStationSql(column: string): string {
    return `INITCAP(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(${column}, '\\s+DC$', '', 'i'), '\\s+', ' ', 'g')))`
  }

  async getDashboard(dto: BarhalDashboardQueryDto) {
    const hasRange = Boolean(dto.startDate && dto.endDate)
    if (hasRange && daysInRange(dto.startDate!, dto.endDate!) > MAX_RECAP_DAYS) {
      throw new BadRequestException(`Date range must not exceed ${MAX_RECAP_DAYS} days`)
    }

    const params: unknown[] = []
    const conditions: string[] = [`e.remarks ILIKE '%barhal%'`, `e.to_number IS NOT NULL`, `e.completed_date IS NOT NULL`]
    const koliConditions: string[] = []
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      const startIdx = params.length - 1
      const endIdx = params.length
      conditions.push(`e.completed_date BETWEEN $${startIdx} AND $${endIdx}`)
      koliConditions.push(`k.koli_date BETWEEN $${startIdx} AND $${endIdx}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`${this.normalizedStationSql('e.origin_station')} = $${params.length}`)
      koliConditions.push(`k.origin_name = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`${this.normalizedStationSql('e.dest_station')} = $${params.length}`)
      koliConditions.push(`k.dest_name = $${params.length}`)
    }
    const toWhere = `WHERE ${conditions.join(' AND ')}`
    const koliWhere = koliConditions.length ? `WHERE ${koliConditions.join(' AND ')}` : ''

    const scopedCte = `
      scoped AS (
        SELECT
          e.to_number,
          e.gross_weight,
          e.awb,
          e.completed_date AS to_date,
          ${this.normalizedStationSql('e.origin_station')} AS origin_name,
          ${this.normalizedStationSql('e.dest_station')} AS dest_name
        FROM air_shipments_compileaircgk e
        ${toWhere}
      )
    `

    const kpiRow = (
      await this.dataSource.query(
        `
        WITH ${scopedCte},
        koli_ids AS (
          SELECT DISTINCT bkt.koli_id FROM scoped s JOIN barhal_koli_to bkt ON bkt.to_number = s.to_number
        )
        SELECT
          (SELECT COUNT(*)::int FROM koli_ids) AS koli_count,
          (SELECT COUNT(DISTINCT to_number)::int FROM scoped) AS total_to,
          (SELECT COALESCE(SUM(gross_weight), 0)::numeric FROM scoped) AS weight_before,
          (SELECT COALESCE(SUM(k.weight_after - k.weight_before), 0)::numeric
             FROM koli_ids ki JOIN barhal_koli k ON k.id = ki.koli_id
             WHERE k.weight_before IS NOT NULL AND k.weight_after IS NOT NULL) AS weight_increase,
          (SELECT COALESCE(SUM(k.batang_kayu), 0)::int
             FROM koli_ids ki JOIN barhal_koli k ON k.id = ki.koli_id) AS batang_kayu
        `,
        params,
      )
    )[0]

    const koliScopedCte = `koli_scoped AS (SELECT * FROM barhal_koli k ${koliWhere})`

    const perTanggalRows: (RecapAggregateRow & { date: string })[] = await this.dataSource.query(
      `
      WITH ${scopedCte},
      ${koliScopedCte},
      groups AS (
        SELECT to_date AS koli_date FROM scoped
        UNION
        SELECT koli_date FROM koli_scoped
      )
      SELECT
        g.koli_date::text AS date,
        (SELECT COUNT(DISTINCT to_number) FROM scoped s WHERE s.to_date = g.koli_date)::int AS total_to,
        (SELECT COUNT(*) FROM koli_scoped ks WHERE ks.koli_date = g.koli_date)::int AS total_koli,
        (SELECT COUNT(DISTINCT s.awb)
           FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
           WHERE ks.koli_date = g.koli_date AND s.awb IS NOT NULL)::int AS awb_count,
        (SELECT COALESCE(SUM(dt.gross_weight), 0)
           FROM (SELECT DISTINCT ON (bkt.to_number) bkt.to_number, s.gross_weight
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.koli_date = g.koli_date) dt)::numeric AS weight_before,
        (SELECT COALESCE(SUM(r.chwt), 0)
           FROM (SELECT DISTINCT s.awb
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.koli_date = g.koli_date AND s.awb IS NOT NULL) awbs
           LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb)::numeric AS chwt,
        (SELECT COUNT(DISTINCT awbs.awb)
           FROM (SELECT DISTINCT s.awb
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.koli_date = g.koli_date AND s.awb IS NOT NULL) awbs
           LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb
           WHERE r.chwt IS NULL)::int AS missing_chwt,
        (SELECT COALESCE(SUM(ks.weight_after - ks.weight_before), 0)
           FROM koli_scoped ks WHERE ks.koli_date = g.koli_date AND ks.weight_before IS NOT NULL AND ks.weight_after IS NOT NULL)::numeric AS weight_increase,
        (SELECT COALESCE(SUM((ks.length_cm + ks.width_cm + ks.height_cm) * 1000), 0)
           FROM koli_scoped ks WHERE ks.koli_date = g.koli_date AND ks.length_cm IS NOT NULL AND ks.width_cm IS NOT NULL AND ks.height_cm IS NOT NULL)::numeric AS add_revenue
      FROM groups g
      ORDER BY g.koli_date ASC
      `,
      params,
    )

    const perTanggalSparse = perTanggalRows.map((row) => ({ date: row.date, ...toRecapMetrics(row) }))
    // Built from the sparse rows on purpose: a filled-in future date would drag the chart down to 0.
    const chartByDate = perTanggalSparse.map((r) => ({ date: r.date, weightBefore: r.weightBefore, weightAfter: r.weightAfter, chwt: r.chwt }))
    const recapPerTanggal = hasRange
      ? densifyPerTanggal(perTanggalSparse, dto.startDate!, dto.endDate!)
      : perTanggalSparse

    const perRuteRows: (RecapAggregateRow & { originName: string; destName: string })[] = await this.dataSource.query(
      `
      WITH ${scopedCte},
      ${koliScopedCte},
      groups AS (
        SELECT origin_name, dest_name FROM scoped
        UNION
        SELECT origin_name, dest_name FROM koli_scoped
      )
      SELECT
        g.origin_name AS "originName",
        g.dest_name AS "destName",
        (SELECT COUNT(DISTINCT to_number) FROM scoped s WHERE s.origin_name = g.origin_name AND s.dest_name = g.dest_name)::int AS total_to,
        (SELECT COUNT(*) FROM koli_scoped ks WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name)::int AS total_koli,
        (SELECT COUNT(DISTINCT s.awb)
           FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
           WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND s.awb IS NOT NULL)::int AS awb_count,
        (SELECT COALESCE(SUM(dt.gross_weight), 0)
           FROM (SELECT DISTINCT ON (bkt.to_number) bkt.to_number, s.gross_weight
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name) dt)::numeric AS weight_before,
        (SELECT COALESCE(SUM(r.chwt), 0)
           FROM (SELECT DISTINCT s.awb
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND s.awb IS NOT NULL) awbs
           LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb)::numeric AS chwt,
        (SELECT COUNT(DISTINCT awbs.awb)
           FROM (SELECT DISTINCT s.awb
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND s.awb IS NOT NULL) awbs
           LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb
           WHERE r.chwt IS NULL)::int AS missing_chwt,
        (SELECT COALESCE(SUM(ks.weight_after - ks.weight_before), 0)
           FROM koli_scoped ks WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND ks.weight_before IS NOT NULL AND ks.weight_after IS NOT NULL)::numeric AS weight_increase,
        (SELECT COALESCE(SUM((ks.length_cm + ks.width_cm + ks.height_cm) * 1000), 0)
           FROM koli_scoped ks WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND ks.length_cm IS NOT NULL AND ks.width_cm IS NOT NULL AND ks.height_cm IS NOT NULL)::numeric AS add_revenue
      FROM groups g
      ORDER BY g.origin_name, g.dest_name
      `,
      params,
    )

    const recapPerRute = perRuteRows.map((row) => ({ originName: row.originName, destName: row.destName, ...toRecapMetrics(row) }))

    const recapBatangKayu = await this.dataSource.query(
      `
      SELECT
        k.koli_date::text AS date,
        COUNT(*)::int AS "totalKoli",
        COALESCE(SUM(k.length_cm), 0)::numeric AS "totalP",
        COALESCE(SUM(k.width_cm), 0)::numeric AS "totalL",
        COALESCE(SUM(k.height_cm), 0)::numeric AS "totalT",
        COALESCE(SUM(k.volume), 0)::numeric AS "totalVolume",
        COALESCE(SUM(k.batang_kayu), 0)::int AS "totalBatangKayu"
      FROM barhal_koli k
      ${koliWhere}
      GROUP BY k.koli_date
      ORDER BY k.koli_date DESC
      `,
      params,
    )

    const recapBatangKayuNormalized = recapBatangKayu.map((row) => ({
      ...row,
      totalP: Number(row.totalP),
      totalL: Number(row.totalL),
      totalT: Number(row.totalT),
      totalVolume: Number(row.totalVolume),
    }))

    return {
      kpi: {
        totalKoli: kpiRow.koli_count,
        totalTo: kpiRow.total_to,
        totalWeightBefore: Number(kpiRow.weight_before),
        totalWeightAfter: Number(kpiRow.weight_before) + Number(kpiRow.weight_increase),
        totalVariance: Number(kpiRow.weight_increase),
        totalBatangKayu: kpiRow.batang_kayu,
      },
      chartByDate,
      recapBatangKayu: recapBatangKayuNormalized,
      recapPerTanggal,
      recapPerRute,
    }
  }

  /**
   * Per-TO detail rows for the dashboard, split by whether the TO has been packed into a Koli.
   * DISTINCT ON (to_number) guards against the source sheet carrying more than one row per TO,
   * which would otherwise duplicate rows and inflate the paginated total.
   */
  async getToDetail(dto: BarhalToDetailQueryDto): Promise<{
    data: BarhalToDetailRow[]
    total: number
    page: number
    pageSize: number
  }> {
    const page = dto.page ?? 1
    const pageSize = dto.pageSize ?? 25

    const params: unknown[] = []
    const conditions: string[] = [
      `e.remarks ILIKE '%barhal%'`,
      `e.to_number IS NOT NULL`,
      `e.completed_date IS NOT NULL`,
    ]
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      conditions.push(`e.completed_date BETWEEN $${params.length - 1} AND $${params.length}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`${this.normalizedStationSql('e.origin_station')} = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`${this.normalizedStationSql('e.dest_station')} = $${params.length}`)
    }

    const baseCte = `
      base AS (
        SELECT DISTINCT ON (e.to_number)
          e.to_number,
          e.completed_date,
          e.gross_weight,
          ${this.normalizedStationSql('e.origin_station')} AS origin_name,
          ${this.normalizedStationSql('e.dest_station')} AS dest_name
        FROM air_shipments_compileaircgk e
        WHERE ${conditions.join(' AND ')}
        ORDER BY e.to_number, e.completed_date DESC
      )
    `

    const inKoli = dto.tab === 'in-koli'
    const tabClause = inKoli
      ? `JOIN barhal_koli_to bkt ON bkt.to_number = b.to_number
         JOIN barhal_koli k ON k.id = bkt.koli_id`
      : `WHERE NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = b.to_number)`

    const countRow = (
      await this.dataSource.query(
        `WITH ${baseCte} SELECT COUNT(*)::int AS total FROM base b ${tabClause}`,
        params,
      )
    )[0]

    const dataParams = [...params, pageSize, (page - 1) * pageSize]
    const rows: {
      date: string
      originName: string
      destName: string
      toNumber: string
      koliNumber: string | null
      grossWeight: string | null
    }[] = await this.dataSource.query(
      `
      WITH ${baseCte}
      SELECT
        b.completed_date::text AS date,
        b.origin_name          AS "originName",
        b.dest_name            AS "destName",
        b.to_number            AS "toNumber",
        ${inKoli ? 'k.koli_number' : 'NULL::text'} AS "koliNumber",
        b.gross_weight::numeric AS "grossWeight"
      FROM base b
      ${tabClause}
      ORDER BY b.completed_date DESC, b.to_number
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      dataParams,
    )

    return {
      data: rows.map((row) => ({
        ...row,
        grossWeight: row.grossWeight != null ? Number(row.grossWeight) : null,
      })),
      total: countRow.total,
      page,
      pageSize,
    }
  }

  async exportCsv(dto: BarhalDashboardQueryDto): Promise<string> {
    const params: unknown[] = []
    const conditions: string[] = []
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      conditions.push(`k.koli_date BETWEEN $${params.length - 1} AND $${params.length}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`k.origin_name = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`k.dest_name = $${params.length}`)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows: BarhalCsvRow[] = await this.dataSource.query(
      `
      SELECT
        k.koli_number   AS "koliNumber",
        k.koli_date     AS "koliDate",
        k.origin_name   AS "originName",
        k.dest_name     AS "destName",
        k.total_to      AS "totalTo",
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
