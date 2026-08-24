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
import { BarhalDrilldownQueryDto } from './dto/barhal-drilldown-query.dto'
import { BarhalToDetailQueryDto } from './dto/barhal-to-detail-query.dto'
import { UpdatePackingDto } from './dto/update-packing.dto'
import { UpdateSmuDto } from './dto/update-smu.dto'
import { BulkUpdateSmuDto } from './dto/bulk-update-smu.dto'
import { SmuListQueryDto } from './dto/smu-list-query.dto'
import { buildBarhalCsv, BarhalCsvRow } from './barhal-csv.builder'
import {
  toRecapMetrics,
  densifyPerTanggal,
  densifyPerRute,
  daysInRange,
  MAX_RECAP_DAYS,
  RecapAggregateRow,
  RecapPerTanggalRow,
  RecapPerRuteRow,
  RouteKey,
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

/**
 * Master rute: pasangan DC → nama stasiun. DISTINCT ON bersifat wajib, bukan kosmetik —
 * air_shipments_data unik pada (service, origin_dc, destination_dc), sehingga satu pasangan
 * DC bisa punya baris Air *dan* Sea. Tanpa ini, join akan menggandakan baris TO.
 *
 * Baris master yang nama stasiunnya kosong dibuang di sini, bukan di setiap pemakai: pasangan DC
 * tanpa nama tidak bisa dipakai sebagai rute oleh siapa pun. Karena filternya berada di dalam CTE,
 * DISTINCT ON juga jadi bisa memilih baris service lain yang namanya terisi untuk pasangan DC yang
 * sama, alih-alih memakai baris kosong lalu menganggap rutenya tidak ada.
 */
const ROUTE_MASTER_CTE = `
  route_master AS (
    SELECT DISTINCT ON (origin_dc, destination_dc)
      origin_dc,
      destination_dc,
      extra_fields->>'origin_station'      AS origin_station,
      extra_fields->>'destination_station' AS dest_station
    FROM air_shipments_data
    WHERE origin_dc IS NOT NULL AND destination_dc IS NOT NULL
      AND NULLIF(BTRIM(extra_fields->>'origin_station'), '') IS NOT NULL
      AND NULLIF(BTRIM(extra_fields->>'destination_station'), '') IS NOT NULL
    ORDER BY origin_dc, destination_dc, service
  )
`

/**
 * Rute sebuah TO dibaca dari master lewat pasangan DC-nya, sama seperti picker TO dan dropdown
 * stasiun. Kolom station milik compileaircgk sendiri sengaja tidak dipakai: keduanya generated
 * column atas key sheet (`origin_station`/`destination_station`) yang bisa saja tidak terkirim,
 * dan saat itu terjadi seluruh TO jatuh ke satu grup rute (NULL, NULL) yang angkanya nol semua —
 * `=` tidak pernah cocok dengan NULL, sehingga grup itu tak menemukan barisnya sendiri.
 *
 * JOIN-nya inner, persis seperti picker yang membuang TO tanpa pasangan master: TO yang rutenya
 * tidak dapat dipetakan tidak akan pernah bisa dipacking, sehingga menghitungnya di rekap hanya
 * membuat harinya Incomplete selamanya tanpa ada yang bisa dikerjakan operator.
 */
const TO_ROUTE_JOIN = `
      JOIN route_master rm
        ON rm.origin_dc      = e.extra_fields->>'origin'
       AND rm.destination_dc = e.extra_fields->>'destination'`

/**
 * Satu baris Reservasi per AWB, dan No. SMU sebuah Koli adalah AWB itu sendiri — `awb` satu-satunya
 * kolom identitas di tabel Reservasi. Unique key air_shipments_smu_rate_cgk_spx sudah dilebarkan
 * dari [awb] menjadi [awb, account, via, dest], sehingga satu AWB boleh punya baris rate yang bersih
 * plus baris parsial; menjumlahkan chwt lewat join `r.awb = ...` karena itu menggandakan angkanya.
 * Pemilihan barisnya disamakan dengan cara v_pnl_to memilih satu booking per AWB
 * (20260711000001-pnl-dedup-booking-per-awb.ts) agar chWt Barhal dan PnL tidak saling berbeda.
 *
 * Dipakai bersama oleh recap (lewat buildScopeSql), exportCsv, dan getSmuList. Dua yang terakhir
 * tidak memanggil buildScopeSql, jadi definisinya tinggal di konstanta ini supaya tunggal.
 */
const SMU_CHWT_CTE = `
  smu_chwt AS (
    SELECT DISTINCT ON (awb) awb, chwt
    FROM air_shipments_smu_rate_cgk_spx
    ORDER BY awb,
      -- utamakan baris yang join key-nya lengkap (baris rate yang benar-benar terpakai)
      (NULLIF(BTRIM(account), '') IS NOT NULL
       AND NULLIF(BTRIM(via),  '') IS NOT NULL
       AND NULLIF(BTRIM(dest), '') IS NOT NULL) DESC,
      updated_at DESC NULLS LAST
  )
`

/**
 * Satu baris per TO, diambil yang paling baru.
 *
 * air_shipments_compileaircgk unik pada (lt_number, to_number), sehingga satu TO bisa punya
 * beberapa baris dengan LT dan tanggal berbeda — bukan kasus teoretis, data produksi sudah
 * memuatnya. Tanpa DISTINCT ON, join ke barhal_koli_to menggandakan baris TO dan jumlah baris
 * CSV melampaui total_to Koli-nya. Pola pemilihan barisnya sama seperti SMU_CHWT_CTE.
 *
 * vendor dan qty_parcel dibaca dari extra_fields karena keduanya bukan generated column,
 * berbeda dari shipment_date/lt_number/remarks/gross_weight yang sudah dimaterialisasi.
 */
const TO_LATEST_CTE = `
  to_latest AS (
    SELECT DISTINCT ON (to_number)
      to_number,
      lt_number,
      shipment_date,
      gross_weight,
      remarks,
      extra_fields->>'vendor'     AS vendor,
      extra_fields->>'qty_parcel' AS qty_parcel
    FROM air_shipments_compileaircgk
    WHERE to_number IS NOT NULL
    ORDER BY to_number, updated_at DESC NULLS LAST
  )
`

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
      WITH ${ROUTE_MASTER_CTE}
      SELECT DISTINCT rm.origin_station, rm.dest_station
      FROM air_shipments_compileaircgk c
      JOIN route_master rm
        ON rm.origin_dc      = c.extra_fields->>'origin'
       AND rm.destination_dc = c.extra_fields->>'destination'
      WHERE c.remarks ILIKE '%barhal%'
        AND rm.origin_station IS NOT NULL AND rm.origin_station != ''
        AND rm.dest_station IS NOT NULL AND rm.dest_station != ''
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

  /**
   * Barhal-only TOs (remarks ILIKE '%barhal%') not yet packed into any Koli.
   *
   * Rute dibaca dari master air_shipments_data lewat pasangan DC, bukan dari kolom station
   * milik compileaircgk. LEFT JOIN dipakai agar baris yang tidak punya pasangan di master
   * masih bisa dihitung, lalu dibuang — operator perlu tahu berapa banyak yang tersaring.
   */
  async getAvailableTos(dto: AvailableToDto): Promise<{ data: AvailableToRow[]; unmatchedRouteCount: number }> {
    const params: unknown[] = []
    params.push('%barhal%')
    const conditions: string[] = [`c.remarks ILIKE $${params.length}`]

    if (dto.search) {
      params.push(`%${dto.search}%`)
      // AWB is matched here rather than client-side: the picker only ever holds AVAILABLE_TOS_LIMIT
      // rows, so a filter applied after that cut cannot reach a TO the limit already excluded.
      conditions.push(
        `(c.to_number ILIKE $${params.length} OR c.lt_number ILIKE $${params.length} OR c.awb ILIKE $${params.length})`,
      )
    }
    if (dto.date) {
      params.push(dto.date)
      conditions.push(`c.shipment_date = $${params.length}`)
    }

    let excludeAttachedClause = 'NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = c.to_number)'
    if (dto.koliId) {
      params.push(dto.koliId)
      excludeAttachedClause = `NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = c.to_number AND bkt.koli_id != $${params.length})`
    }

    const rows: AvailableToRow[] = await this.dataSource.query(
      `
      WITH ${ROUTE_MASTER_CTE}
      SELECT
        c.to_number,
        c.awb,
        c.gross_weight,
        rm.origin_station,
        rm.dest_station AS dest_station,
        c.lt_number,
        c.remarks,
        c.shipment_date AS date
      FROM air_shipments_compileaircgk c
      LEFT JOIN route_master rm
        ON rm.origin_dc      = c.extra_fields->>'origin'
       AND rm.destination_dc = c.extra_fields->>'destination'
      WHERE c.to_number IS NOT NULL
        AND ${excludeAttachedClause}
        AND ${conditions.join(' AND ')}
      ORDER BY c.to_number
      `,
      params,
    )

    // Baris tanpa pasangan di master tidak punya rute sama sekali, sehingga tidak mungkin
    // dipersempit filter origin/dest — hitungannya karena itu diambil sebelum filter itu.
    const matched = rows.filter((row) => row.origin_station && row.dest_station)
    const unmatchedRouteCount = rows.length - matched.length

    const originFilter = dto.origin ? normalizeStationName(dto.origin) : undefined
    const destFilter = dto.dest ? normalizeStationName(dto.dest) : undefined
    const filtered = matched.filter((row) => {
      if (originFilter && normalizeStationName(row.origin_station) !== originFilter) return false
      if (destFilter && normalizeStationName(row.dest_station) !== destFilter) return false
      return true
    })
    const AVAILABLE_TOS_LIMIT = 100
    return {
      data: filtered.slice(0, AVAILABLE_TOS_LIMIT).map((row) => ({
        ...row,
        origin_station: row.origin_station ? normalizeStationName(row.origin_station) : row.origin_station,
        dest_station: row.dest_station ? normalizeStationName(row.dest_station) : row.dest_station,
        vendor: 'ESP' as const,
      })),
      unmatchedRouteCount,
    }
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

    // The remarks filter is a guard, not a convenience: getAvailableTos only ever offers barhal TOs,
    // but this endpoint takes whatever to_numbers the client sends. It is the only write path into
    // barhal_koli_to, so anything that slips through here becomes Koli contents and then feeds every
    // Koli-driven figure in the module — weights, AWBs, chWt, recap status.
    const toRows: { to_number: string; awb: string | null; gross_weight: number | null }[] = dto.toNumbers.length
      ? await this.dataSource.query(
          `SELECT to_number, awb, gross_weight FROM air_shipments_compileaircgk
           WHERE to_number = ANY($1) AND remarks ILIKE $2`,
          [dto.toNumbers, '%barhal%'],
        )
      : []
    if (toRows.length !== dto.toNumbers.length) {
      throw new BadRequestException('One or more selected TOs could not be found, or are not Barhal TOs')
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
    // Bentuk NULLIF(BTRIM(...)) yang sama dipakai di seluruh modul: Koli yang No. SMU-nya hanya
    // spasi tidak boleh muncul sebagai grup SMU tersendiri.
    const conditions: string[] = [`NULLIF(BTRIM(k.smu_number), '') IS NOT NULL`]
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
      WITH ${SMU_CHWT_CTE}
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
        (SELECT sc.chwt FROM smu_chwt sc WHERE sc.awb = BTRIM(k.smu_number))::numeric AS chwt
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

  /**
   * Membangun parameter terikat dan dua CTE cakupan yang dipakai bersama oleh dashboard
   * dan drilldown. Tidak menjalankan query apa pun, sehingga urutan panggilan
   * dataSource.query di getDashboard tidak berubah.
   */
  private buildScopeSql(dto: BarhalDashboardQueryDto): {
    params: unknown[]
    routeMasterCte: string
    scopedCte: string
    koliScopedCte: string
    packedCte: string
    smuChwtCte: string
  } {
    const params: unknown[] = []
    const conditions: string[] = [`e.remarks ILIKE '%barhal%'`, `e.to_number IS NOT NULL`, `e.shipment_date IS NOT NULL`]
    const koliConditions: string[] = []
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      const startIdx = params.length - 1
      const endIdx = params.length
      conditions.push(`e.shipment_date BETWEEN $${startIdx} AND $${endIdx}`)
      koliConditions.push(`k.koli_date BETWEEN $${startIdx} AND $${endIdx}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`${this.normalizedStationSql('rm.origin_station')} = $${params.length}`)
      koliConditions.push(`k.origin_name = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`${this.normalizedStationSql('rm.dest_station')} = $${params.length}`)
      koliConditions.push(`k.dest_name = $${params.length}`)
    }
    const toWhere = `WHERE ${conditions.join(' AND ')}`
    const koliWhere = koliConditions.length ? `WHERE ${koliConditions.join(' AND ')}` : ''

    return {
      params,
      routeMasterCte: ROUTE_MASTER_CTE,
      scopedCte: `
      scoped AS (
        SELECT
          e.to_number,
          e.gross_weight,
          e.shipment_date AS to_date,
          ${this.normalizedStationSql('rm.origin_station')} AS origin_name,
          ${this.normalizedStationSql('rm.dest_station')} AS dest_name
        FROM air_shipments_compileaircgk e
        ${TO_ROUTE_JOIN}
        ${toWhere}
      )
    `,
      koliScopedCte: `koli_scoped AS (SELECT * FROM barhal_koli k ${koliWhere})`,
      /**
       * What is inside each in-scope Koli. Deliberately NOT read through `scoped`: a Koli routinely
       * holds TOs dated weeks before it was packed, so re-applying the dashboard's date/station
       * filter to a Koli's own contents would silently drop them. That is what made a drilldown
       * disagree with the row it was opened from — the parent row saw those TOs, the child rows,
       * narrowed to a single date, did not. Only the Koli side is scoped, so the groups a row
       * expands into always partition that row exactly.
       *
       * The LATERAL keeps one TO sheet row per to_number, the same guard the DISTINCT ON in
       * getToDetail applies against a source sheet that repeats a TO. Its remarks filter is the one
       * predicate that does belong here: it says what a barhal TO *is* rather than which slice of
       * them this row covers, so it removes the same rows from a parent and its children alike.
       * attachTos already refuses non-barhal TOs; this keeps any that predate that guard out of the
       * figures rather than trusting the table.
       *
       * `matches_koli` says whether a content TO actually belongs to the Koli's own date AND route.
       * It is deliberately a property of the Koli alone, comparing the TO against `ks`, never against
       * the group being aggregated: both recap tables ask the identical question about a given Koli,
       * which is what lets the resulting counter roll up in either direction. Keying it off the group
       * axis instead would have the per-tanggal and per-rute rows asking different things about the
       * same Koli, and a parent could go Completed over an Incomplete child again.
       */
      packedCte: `
      packed AS (
        SELECT
          ks.id AS koli_id, ks.koli_date, ks.origin_name, ks.dest_name,
          bkt.to_number, t.gross_weight,
          (t.to_date = ks.koli_date AND t.origin_name = ks.origin_name AND t.dest_name = ks.dest_name)
            AS matches_koli
        FROM koli_scoped ks
        JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id
        LEFT JOIN LATERAL (
          SELECT
            e.gross_weight,
            e.shipment_date AS to_date,
            ${this.normalizedStationSql('rm.origin_station')} AS origin_name,
            ${this.normalizedStationSql('rm.dest_station')} AS dest_name
          FROM air_shipments_compileaircgk e
          ${TO_ROUTE_JOIN}
          WHERE e.to_number = bkt.to_number AND e.remarks ILIKE '%barhal%'
          ORDER BY e.shipment_date DESC NULLS LAST
          LIMIT 1
        ) t ON TRUE
      )
    `,
      smuChwtCte: SMU_CHWT_CTE,
    }
  }

  /**
   * Agregat rekap per tanggal. Dipakai bersama oleh getDashboard dan getDrilldown.
   *
   * chWt bersumber dari No. SMU milik Koli, bukan dari AWB milik TO. `barhal_koli_to.awb` sudah
   * terisi sejak TO dipilih, sehingga chWt sempat muncul sebelum operator mengisi No. SMU sama
   * sekali. Koli yang No. SMU-nya kosong karena itu tidak menyumbang chWt, dan penjumlahannya
   * dilakukan atas No. SMU distinct dalam grup — satu SMU yang dipakai beberapa Koli hanya
   * dihitung sekali, sama seperti satu SMU hanya memetakan ke satu baris Reservasi lewat smu_chwt.
   *
   * `to_without_chwt` sengaja mencari Koli lewat barhal_koli_to + barhal_koli global, bukan lewat
   * `packed` yang sudah ter-scope Koli. Alasannya sama dengan yang dijelaskan di toRecapMetrics:
   * counter ini harus tetap menjadi properti TO itu sendiri agar status dapat roll-up dua arah;
   * membacanya lewat `packed` membuat baris induk bisa kembali Completed di atas anak yang
   * Incomplete. Polanya identik dengan `unpacked_to`. Konsekuensinya `to_without_chwt` kini
   * mencakup `unpacked_to` — TO yang belum dipacking pasti belum punya Koli ber-SMU — dan kedua
   * counter tetap dipisah karena tidak ada biayanya dan keduanya menjawab pertanyaan yang berbeda.
   */
  private queryPerTanggal(
    recapCtes: string,
    params: unknown[],
  ): Promise<(RecapAggregateRow & { date: string })[]> {
    return this.dataSource.query(
      `
      WITH ${recapCtes},
      groups AS (
        SELECT to_date AS koli_date FROM scoped
        UNION
        SELECT koli_date FROM koli_scoped
      )
      SELECT
        g.koli_date::text AS date,
        (SELECT COUNT(DISTINCT to_number) FROM scoped s WHERE s.to_date = g.koli_date)::int AS total_to,
        (SELECT COUNT(*) FROM koli_scoped ks WHERE ks.koli_date = g.koli_date)::int AS total_koli,
        (SELECT COUNT(DISTINCT s.to_number) FROM scoped s
           WHERE s.to_date = g.koli_date
             AND NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = s.to_number))::int AS unpacked_to,
        (SELECT COUNT(DISTINCT s.to_number) FROM scoped s
           WHERE s.to_date = g.koli_date
             AND NOT EXISTS (
               SELECT 1
                 FROM barhal_koli_to bkt
                 JOIN barhal_koli bk ON bk.id = bkt.koli_id
                 JOIN smu_chwt sc ON sc.awb = NULLIF(BTRIM(bk.smu_number), '')
                WHERE bkt.to_number = s.to_number AND sc.chwt IS NOT NULL))::int AS to_without_chwt,
        (SELECT COUNT(*) FROM koli_scoped ks
           WHERE ks.koli_date = g.koli_date
             AND NULLIF(BTRIM(ks.smu_number), '') IS NULL)::int AS koli_without_smu,
        (SELECT COUNT(*) FROM koli_scoped ks
           WHERE ks.koli_date = g.koli_date
             AND NOT EXISTS (SELECT 1 FROM packed p WHERE p.koli_id = ks.id AND p.matches_koli))::int AS koli_without_matching_to,
        (SELECT COALESCE(SUM(dt.gross_weight), 0)
           FROM (SELECT DISTINCT ON (p.to_number) p.to_number, p.gross_weight
                 FROM packed p WHERE p.koli_date = g.koli_date) dt)::numeric AS weight_before,
        (SELECT COALESCE(SUM(sc.chwt), 0)
           FROM (SELECT DISTINCT NULLIF(BTRIM(ks.smu_number), '') AS smu_number
                   FROM koli_scoped ks
                  WHERE ks.koli_date = g.koli_date AND NULLIF(BTRIM(ks.smu_number), '') IS NOT NULL) smus
           LEFT JOIN smu_chwt sc ON sc.awb = smus.smu_number)::numeric AS chwt,
        (SELECT COUNT(*)
           FROM (SELECT DISTINCT NULLIF(BTRIM(ks.smu_number), '') AS smu_number
                   FROM koli_scoped ks
                  WHERE ks.koli_date = g.koli_date AND NULLIF(BTRIM(ks.smu_number), '') IS NOT NULL) smus
           LEFT JOIN smu_chwt sc ON sc.awb = smus.smu_number
          WHERE sc.chwt IS NULL)::int AS koli_smu_without_chwt,
        (SELECT COALESCE(SUM(ks.weight_after - ks.weight_before), 0)
           FROM koli_scoped ks WHERE ks.koli_date = g.koli_date AND ks.weight_before IS NOT NULL AND ks.weight_after IS NOT NULL)::numeric AS weight_increase,
        (SELECT COALESCE(SUM((ks.length_cm + ks.width_cm + ks.height_cm) * 1000), 0)
           FROM koli_scoped ks WHERE ks.koli_date = g.koli_date AND ks.length_cm IS NOT NULL AND ks.width_cm IS NOT NULL AND ks.height_cm IS NOT NULL)::numeric AS add_revenue
      FROM groups g
      ORDER BY g.koli_date ASC
      `,
      params,
    )
  }

  /**
   * Agregat rekap per rute. Dipakai bersama oleh getDashboard dan getDrilldown. Ekspresi chWt dan
   * ketiga counter SMU-nya identik dengan queryPerTanggal — hanya predikat grupnya yang berbeda —
   * sehingga penjelasannya ada di doc comment queryPerTanggal.
   */
  private queryPerRute(
    recapCtes: string,
    params: unknown[],
  ): Promise<(RecapAggregateRow & { originName: string; destName: string })[]> {
    return this.dataSource.query(
      `
      WITH ${recapCtes},
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
        (SELECT COUNT(DISTINCT s.to_number) FROM scoped s
           WHERE s.origin_name = g.origin_name AND s.dest_name = g.dest_name
             AND NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = s.to_number))::int AS unpacked_to,
        (SELECT COUNT(DISTINCT s.to_number) FROM scoped s
           WHERE s.origin_name = g.origin_name AND s.dest_name = g.dest_name
             AND NOT EXISTS (
               SELECT 1
                 FROM barhal_koli_to bkt
                 JOIN barhal_koli bk ON bk.id = bkt.koli_id
                 JOIN smu_chwt sc ON sc.awb = NULLIF(BTRIM(bk.smu_number), '')
                WHERE bkt.to_number = s.to_number AND sc.chwt IS NOT NULL))::int AS to_without_chwt,
        (SELECT COUNT(*) FROM koli_scoped ks
           WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name
             AND NULLIF(BTRIM(ks.smu_number), '') IS NULL)::int AS koli_without_smu,
        (SELECT COUNT(*) FROM koli_scoped ks
           WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name
             AND NOT EXISTS (SELECT 1 FROM packed p WHERE p.koli_id = ks.id AND p.matches_koli))::int AS koli_without_matching_to,
        (SELECT COALESCE(SUM(dt.gross_weight), 0)
           FROM (SELECT DISTINCT ON (p.to_number) p.to_number, p.gross_weight
                 FROM packed p WHERE p.origin_name = g.origin_name AND p.dest_name = g.dest_name) dt)::numeric AS weight_before,
        (SELECT COALESCE(SUM(sc.chwt), 0)
           FROM (SELECT DISTINCT NULLIF(BTRIM(ks.smu_number), '') AS smu_number
                   FROM koli_scoped ks
                  WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name
                    AND NULLIF(BTRIM(ks.smu_number), '') IS NOT NULL) smus
           LEFT JOIN smu_chwt sc ON sc.awb = smus.smu_number)::numeric AS chwt,
        (SELECT COUNT(*)
           FROM (SELECT DISTINCT NULLIF(BTRIM(ks.smu_number), '') AS smu_number
                   FROM koli_scoped ks
                  WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name
                    AND NULLIF(BTRIM(ks.smu_number), '') IS NOT NULL) smus
           LEFT JOIN smu_chwt sc ON sc.awb = smus.smu_number
          WHERE sc.chwt IS NULL)::int AS koli_smu_without_chwt,
        (SELECT COALESCE(SUM(ks.weight_after - ks.weight_before), 0)
           FROM koli_scoped ks WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND ks.weight_before IS NOT NULL AND ks.weight_after IS NOT NULL)::numeric AS weight_increase,
        (SELECT COALESCE(SUM((ks.length_cm + ks.width_cm + ks.height_cm) * 1000), 0)
           FROM koli_scoped ks WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND ks.length_cm IS NOT NULL AND ks.width_cm IS NOT NULL AND ks.height_cm IS NOT NULL)::numeric AS add_revenue
      FROM groups g
      ORDER BY g.origin_name, g.dest_name
      `,
      params,
    )
  }

  async getDashboard(dto: BarhalDashboardQueryDto) {
    const hasRange = Boolean(dto.startDate && dto.endDate)
    if (hasRange && daysInRange(dto.startDate!, dto.endDate!) > MAX_RECAP_DAYS) {
      throw new BadRequestException(`Date range must not exceed ${MAX_RECAP_DAYS} days`)
    }

    const { params, routeMasterCte, scopedCte, koliScopedCte, packedCte, smuChwtCte } = this.buildScopeSql(dto)
    const recapCtes = [routeMasterCte, scopedCte, koliScopedCte, packedCte, smuChwtCte].join(',')

    // The KPI cards are the recap's column totals, so they read the same two scopes the recap does:
    // TO figures from `scoped`, Koli figures from `koli_scoped` and its contents in `packed`.
    //
    // They used to reach Kolis through the TOs in range instead — DISTINCT bkt.koli_id over `scoped`
    // — which is a different set of Kolis than the recap's. A Koli packed this month routinely holds
    // TOs dated months earlier, so a range whose Kolis all held older TOs produced Total Koli 0 and
    // 0 kg on the cards while the table below them listed those Kolis with real weights.
    const kpiRow = (
      await this.dataSource.query(
        `
        WITH ${routeMasterCte},
        ${scopedCte},
        ${koliScopedCte},
        ${packedCte}
        SELECT
          (SELECT COUNT(*)::int FROM koli_scoped) AS koli_count,
          (SELECT COUNT(DISTINCT to_number)::int FROM scoped) AS total_to,
          (SELECT COALESCE(SUM(dt.gross_weight), 0)::numeric
             FROM (SELECT DISTINCT ON (p.to_number) p.to_number, p.gross_weight FROM packed p) dt) AS weight_before,
          (SELECT COALESCE(SUM(ks.weight_after - ks.weight_before), 0)::numeric
             FROM koli_scoped ks
             WHERE ks.weight_before IS NOT NULL AND ks.weight_after IS NOT NULL) AS weight_increase,
          (SELECT COALESCE(SUM(ks.batang_kayu), 0)::int FROM koli_scoped ks) AS batang_kayu
        `,
        params,
      )
    )[0]

    const perTanggalRows = await this.queryPerTanggal(recapCtes, params)

    const perTanggalSparse = perTanggalRows.map((row) => ({ date: row.date, ...toRecapMetrics(row) }))
    // Built from the sparse rows on purpose: a filled-in future date would drag the chart down to 0.
    const chartByDate = perTanggalSparse.map((r) => ({ date: r.date, weightBefore: r.weightBefore, weightAfter: r.weightAfter, chwt: r.chwt }))
    const recapPerTanggal = hasRange
      ? densifyPerTanggal(perTanggalSparse, dto.startDate!, dto.endDate!)
      : perTanggalSparse

    const perRuteRows = await this.queryPerRute(recapCtes, params)

    // Deliberately not date-filtered: the route list must stay the same from month to month, so a
    // route with no shipments in the selected range still shows up as an all-zero statusless row.
    const routeParams: unknown[] = []
    const routeConditions: string[] = [
      `e.remarks ILIKE '%barhal%'`,
      `e.to_number IS NOT NULL`,
      `e.shipment_date IS NOT NULL`,
    ]
    if (dto.origin) {
      routeParams.push(dto.origin)
      routeConditions.push(`${this.normalizedStationSql('rm.origin_station')} = $${routeParams.length}`)
    }
    if (dto.dest) {
      routeParams.push(dto.dest)
      routeConditions.push(`${this.normalizedStationSql('rm.dest_station')} = $${routeParams.length}`)
    }

    // Rutenya dibaca lewat join master yang sama dengan `scoped`, sehingga daftar rute ini dan
    // grup yang dihasilkan agregat selalu berasal dari satu sumber nama stasiun.
    const masterRoutes: RouteKey[] = await this.dataSource.query(
      `
      WITH ${routeMasterCte}
      SELECT DISTINCT
        ${this.normalizedStationSql('rm.origin_station')} AS "originName",
        ${this.normalizedStationSql('rm.dest_station')}   AS "destName"
      FROM air_shipments_compileaircgk e
      ${TO_ROUTE_JOIN}
      WHERE ${routeConditions.join(' AND ')}
      ORDER BY 1, 2
      `,
      routeParams,
    )

    const recapPerRute = densifyPerRute(
      perRuteRows.map((row) => ({ originName: row.originName, destName: row.destName, ...toRecapMetrics(row) })),
      masterRoutes,
    )

    const recapBatangKayu = await this.dataSource.query(
      `
      WITH ${koliScopedCte}
      SELECT
        k.koli_date::text AS date,
        COUNT(*)::int AS "totalKoli",
        COALESCE(SUM(k.length_cm), 0)::numeric AS "totalP",
        COALESCE(SUM(k.width_cm), 0)::numeric AS "totalL",
        COALESCE(SUM(k.height_cm), 0)::numeric AS "totalT",
        COALESCE(SUM(k.volume), 0)::numeric AS "totalVolume",
        COALESCE(SUM(k.batang_kayu), 0)::int AS "totalBatangKayu"
      FROM koli_scoped k
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
   * Rincian satu baris rekap. Memakai SQL agregat yang sama persis dengan dashboard,
   * sehingga angkanya pasti rekonsiliasi dengan baris induknya.
   *
   * Densifikasi sengaja dilewati: mengisi seluruh tanggal kalender atau seluruh rute master
   * di dalam baris yang dibuka hanya menghasilkan puluhan baris nol. Drilldown hanya
   * menampilkan grup yang benar-benar ada aktivitasnya.
   */
  async getDrilldown(dto: BarhalDrilldownQueryDto): Promise<RecapPerTanggalRow[] | RecapPerRuteRow[]> {
    if (dto.startDate && dto.endDate && daysInRange(dto.startDate, dto.endDate) > MAX_RECAP_DAYS) {
      throw new BadRequestException(`Date range must not exceed ${MAX_RECAP_DAYS} days`)
    }

    const { params, routeMasterCte, scopedCte, koliScopedCte, packedCte, smuChwtCte } = this.buildScopeSql(dto)
    const recapCtes = [routeMasterCte, scopedCte, koliScopedCte, packedCte, smuChwtCte].join(',')

    if (dto.groupBy === 'route') {
      const rows = await this.queryPerRute(recapCtes, params)
      return rows.map((row) => ({ originName: row.originName, destName: row.destName, ...toRecapMetrics(row) }))
    }

    const rows = await this.queryPerTanggal(recapCtes, params)
    return rows.map((row) => ({ date: row.date, ...toRecapMetrics(row) }))
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
      `e.shipment_date IS NOT NULL`,
    ]
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      conditions.push(`e.shipment_date BETWEEN $${params.length - 1} AND $${params.length}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`${this.normalizedStationSql('rm.origin_station')} = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`${this.normalizedStationSql('rm.dest_station')} = $${params.length}`)
    }

    // Rute dibaca dari master lewat pasangan DC, sama seperti rekap di atasnya: kolom station
    // milik compileaircgk bisa kosong, dan saat itu terjadi tabel ini menampilkan TO "null → null"
    // yang tidak bisa dijangkau filter origin/dest mana pun.
    const baseCte = `${ROUTE_MASTER_CTE},
      base AS (
        SELECT DISTINCT ON (e.to_number)
          e.to_number,
          e.shipment_date,
          e.gross_weight,
          ${this.normalizedStationSql('rm.origin_station')} AS origin_name,
          ${this.normalizedStationSql('rm.dest_station')} AS dest_name
        FROM air_shipments_compileaircgk e
        ${TO_ROUTE_JOIN}
        WHERE ${conditions.join(' AND ')}
        ORDER BY e.to_number, e.shipment_date DESC
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
        b.shipment_date::text AS date,
        b.origin_name          AS "originName",
        b.dest_name            AS "destName",
        b.to_number            AS "toNumber",
        ${inKoli ? 'k.koli_number' : 'NULL::text'} AS "koliNumber",
        b.gross_weight::numeric AS "grossWeight"
      FROM base b
      ${tabClause}
      ORDER BY b.shipment_date DESC, b.to_number
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

  /**
   * Export per TO: satu baris untuk setiap TO yang sudah dilampirkan ke sebuah Koli.
   *
   * Rentang tanggal disaring pada c.shipment_date (tanggal TO), bukan k.koli_date, supaya yang
   * disaring sama dengan yang tampil di kolom "Date (TO)". Konsekuensinya, jumlah baris CSV tidak
   * selalu sama dengan kartu statistik dashboard yang berbasis koli_date — sebuah TO bisa saja
   * dipacking di bulan yang berbeda dari tanggal TO-nya.
   *
   * TO yang tidak lagi ada di sheet bertanggal NULL sehingga tersaring keluar saat rentang
   * tanggal aktif; tanpa tanggal, baris itu memang tidak bisa ditempatkan dalam rentang mana pun.
   */
  async exportCsv(dto: BarhalDashboardQueryDto): Promise<string> {
    const params: unknown[] = []
    const conditions: string[] = []
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      conditions.push(`c.shipment_date BETWEEN $${params.length - 1} AND $${params.length}`)
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
      WITH ${TO_LATEST_CTE}
      SELECT
        -- ::text wajib. Driver pg mem-parse kolom \`date\` menjadi tengah malam waktu LOKAL, dan
        -- kontainer produksi berjalan pada TZ=Asia/Jakarta (Dockerfile:41), sehingga tanggal 1 Juni
        -- sampai ke builder sebagai 31 Mei 17:00Z dan tiap baris mundur satu hari. Tiga query lain
        -- di berkas ini sudah meng-cast; hanya export lama yang tidak.
        c.shipment_date::text    AS "shipmentDate",
        c.vendor                 AS "vendor",
        k.origin_name            AS "originName",
        k.dest_name              AS "destName",
        c.lt_number              AS "ltNumber",
        t.to_number              AS "toNumber",
        c.gross_weight::numeric  AS "grossWeight",
        c.qty_parcel             AS "qtyParcel",
        c.remarks                AS "remarks",
        -- No. Koli merangkap sebagai ID packing kayu; tidak ada identitas packing yang terpisah.
        k.koli_number            AS "koliNumber",
        k.weight_before::numeric AS "weightBefore",
        k.weight_after::numeric  AS "weightAfter",
        k.smu_number             AS "smuNumber",
        k.airlines               AS "airlines",
        k.flight_no              AS "flightNo",
        k.std                    AS "std",
        k.sta                    AS "sta",
        k.length_cm::numeric     AS "lengthCm",
        k.width_cm::numeric      AS "widthCm",
        k.height_cm::numeric     AS "heightCm",
        k.volume::numeric        AS "volume",
        k.batang_kayu            AS "batangKayu"
      FROM barhal_koli_to t
      JOIN barhal_koli k ON k.id = t.koli_id
      -- LEFT JOIN, bukan inner: barhal_koli_to adalah snapshot, jadi TO yang hilang dari sheet
      -- tetap harus tampil dengan kolom Koli utuh alih-alih lenyap diam-diam dari export.
      LEFT JOIN to_latest c ON c.to_number = t.to_number
      ${where}
      ORDER BY c.shipment_date DESC NULLS LAST, k.koli_number, t.to_number
      `,
      params,
    )
    return buildBarhalCsv(rows)
  }
}
