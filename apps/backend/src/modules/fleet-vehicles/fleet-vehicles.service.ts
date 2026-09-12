import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Not, Repository } from 'typeorm'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { FleetMasterCategory } from '../fleet-master-data/fleet-master-data.constants'
import {
  DEFAULT_PAGE_SIZE,
  FleetSeverity,
  FleetVehicleSort,
  MAX_PAGE_SIZE,
} from './fleet-vehicles.constants'
import { normalizeNopol } from './fleet-nopol'
import { daysUntil, severityFor, todayISO, worstSeverity } from './fleet-severity'
import {
  FleetMasterRef,
  FleetVehicleDocumentView,
  FleetVehicleListResult,
  FleetVehicleView,
} from './fleet-vehicles.types'

export interface ListInput {
  q?: string
  page?: number
  pageSize?: number
  sort?: FleetVehicleSort
  severity?: FleetSeverity
  kepemilikanId?: string
  poolId?: string
  statusId?: string
  includeArchived?: boolean
}

export interface CreateInput {
  nopol: string
  merk?: string | null
  tipe?: string | null
  tahun?: number | null
  kapasitas?: string | null
  noRangka?: string | null
  noMesin?: string | null
  noBpkb?: string | null
  pemilikUnit?: string | null
  odometer?: number | null
  catatan?: string | null
  jenisArmadaId?: string | null
  kepemilikanId?: string | null
  poolId?: string | null
  statusId?: string | null
  driverId?: string | null
}

export type UpdateInput = Partial<CreateInput>

export interface DocumentInput {
  docTypeId: string
  nomor?: string | null
  issuedAt?: string | null
  expiresAt?: string | null
}

const UNIQUE_VIOLATION = '23505'
const NOPOL_UNIQUE_INDEX = 'uq_fleet_vehicles_nopol_active'

// Which master-data category each foreign key must point at. The FK proves the row exists; only
// this proves it is the right kind of row, without which a vehicle could be saved with
// pool_id -> "Mitsubishi Fuso".
const MASTER_FIELD_CATEGORIES: Record<string, FleetMasterCategory> = {
  jenisArmadaId: 'jenis_armada',
  kepemilikanId: 'kepemilikan',
  poolId: 'pool',
  statusId: 'status_kendaraan',
}

@Injectable()
export class FleetVehiclesService {
  constructor(
    @InjectRepository(FleetVehicleEntity)
    private readonly repo: Repository<FleetVehicleEntity>,
    @InjectRepository(FleetVehicleDocumentEntity)
    private readonly docRepo: Repository<FleetVehicleDocumentEntity>,
    @InjectRepository(FleetMasterDataEntity)
    private readonly masterRepo: Repository<FleetMasterDataEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(dto: ListInput): Promise<FleetVehicleListResult> {
    const page = dto.page ?? 1
    const pageSize = Math.min(dto.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

    // Ids first, entities second. skip/take over a query that carries joins makes TypeORM switch
    // to a DISTINCT subquery whose interaction with an ORDER BY on the view's columns is not
    // something to rely on; two explicit queries are predictable and let the documents for the
    // whole page load in one more.
    const idQb = this.repo
      .createQueryBuilder('v')
      .select('v.id', 'id')
      .leftJoin('v.driver', 'dr')
      .leftJoin('fleet_vehicle_document_status', 'vs', 'vs.vehicle_id = v.id')

    if (!dto.includeArchived) idQb.andWhere('v.isActive = TRUE')

    const q = dto.q?.trim()
    if (q) {
      // The plate is stored closed-up (see normalizeNopol) but read aloud and typed spaced, so
      // both sides of that one comparison are stripped. The remaining columns match the term as
      // typed: stripping a driver's name would join their given and family names together.
      idQb.andWhere(
        `(regexp_replace(v.nopol, '[[:space:].-]', '', 'g') ILIKE :qNopol
          OR v.merk ILIKE :q OR v.tipe ILIKE :q
          OR v.noRangka ILIKE :q OR v.noMesin ILIKE :q OR dr.nama ILIKE :q)`,
        { q: `%${q}%`, qNopol: `%${normalizeNopol(q)}%` },
      )
    }

    // 'none' is the absence of a view row, not a fourth rank — a vehicle with no dated document
    // never reaches the GROUP BY.
    if (dto.severity === 'none') idQb.andWhere('vs.vehicle_id IS NULL')
    else if (dto.severity === 'crit') idQb.andWhere('vs.severity_rank = 0')
    else if (dto.severity === 'warn') idQb.andWhere('vs.severity_rank = 1')
    else if (dto.severity === 'ok') idQb.andWhere('vs.severity_rank = 2')

    if (dto.kepemilikanId) {
      idQb.andWhere('v.kepemilikanId = :kepemilikanId', { kepemilikanId: dto.kepemilikanId })
    }
    if (dto.poolId) idQb.andWhere('v.poolId = :poolId', { poolId: dto.poolId })
    if (dto.statusId) idQb.andWhere('v.statusId = :statusId', { statusId: dto.statusId })

    this.applySort(idQb, dto.sort)

    const total = await idQb.getCount()
    const idRows = (await idQb
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getRawMany()) as { id: string }[]
    const ids = idRows.map((r) => r.id)

    if (ids.length === 0) return { rows: [], total, page, pageSize }

    const rows = await this.loadViews(ids)
    return { rows, total, page, pageSize }
  }

  async findOne(id: string): Promise<FleetVehicleView> {
    const [view] = await this.loadViews([id])
    if (!view) throw new NotFoundException('Vehicle not found')
    return view
  }

  async create(dto: CreateInput): Promise<FleetVehicleView> {
    const nopol = normalizeNopol(dto.nopol)
    if (!nopol) throw new BadRequestException('nopol must not be blank')

    await this.assertMasterRefs(dto)
    await this.assertNopolFree(nopol)

    try {
      const saved = await this.repo.save(
        this.repo.create({
          nopol,
          merk: this.blankToNull(dto.merk),
          tipe: this.blankToNull(dto.tipe),
          tahun: dto.tahun ?? null,
          kapasitas: this.blankToNull(dto.kapasitas),
          noRangka: this.blankToNull(dto.noRangka),
          noMesin: this.blankToNull(dto.noMesin),
          noBpkb: this.blankToNull(dto.noBpkb),
          pemilikUnit: this.blankToNull(dto.pemilikUnit),
          odometer: dto.odometer ?? null,
          catatan: this.blankToNull(dto.catatan),
          jenisArmadaId: dto.jenisArmadaId ?? null,
          kepemilikanId: dto.kepemilikanId ?? null,
          poolId: dto.poolId ?? null,
          statusId: dto.statusId ?? null,
          driverId: dto.driverId ?? null,
        }),
      )
      return this.findOne(saved.id)
    } catch (err: unknown) {
      this.throwIfNopolViolation(err, nopol)
      throw err
    }
  }

  async update(id: string, dto: UpdateInput): Promise<FleetVehicleView> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')

    await this.assertMasterRefs(dto)

    // Built key by key rather than spread: an absent field must leave the column alone while an
    // explicit null clears it, and spreading collapses that distinction.
    const patch: Record<string, unknown> = {}
    if (dto.nopol !== undefined) {
      const nopol = normalizeNopol(dto.nopol)
      if (!nopol) throw new BadRequestException('nopol must not be blank')
      if (nopol !== existing.nopol) await this.assertNopolFree(nopol, id)
      patch.nopol = nopol
    }
    if (dto.merk !== undefined) patch.merk = this.blankToNull(dto.merk)
    if (dto.tipe !== undefined) patch.tipe = this.blankToNull(dto.tipe)
    if (dto.tahun !== undefined) patch.tahun = dto.tahun
    if (dto.kapasitas !== undefined) patch.kapasitas = this.blankToNull(dto.kapasitas)
    if (dto.noRangka !== undefined) patch.noRangka = this.blankToNull(dto.noRangka)
    if (dto.noMesin !== undefined) patch.noMesin = this.blankToNull(dto.noMesin)
    if (dto.noBpkb !== undefined) patch.noBpkb = this.blankToNull(dto.noBpkb)
    if (dto.pemilikUnit !== undefined) patch.pemilikUnit = this.blankToNull(dto.pemilikUnit)
    if (dto.odometer !== undefined) patch.odometer = dto.odometer
    if (dto.catatan !== undefined) patch.catatan = this.blankToNull(dto.catatan)
    if (dto.jenisArmadaId !== undefined) patch.jenisArmadaId = dto.jenisArmadaId
    if (dto.kepemilikanId !== undefined) patch.kepemilikanId = dto.kepemilikanId
    if (dto.poolId !== undefined) patch.poolId = dto.poolId
    if (dto.statusId !== undefined) patch.statusId = dto.statusId
    if (dto.driverId !== undefined) patch.driverId = dto.driverId

    if (Object.keys(patch).length > 0) {
      try {
        await this.repo.update(id, patch)
      } catch (err: unknown) {
        this.throwIfNopolViolation(err, String(patch.nopol ?? existing.nopol))
        throw err
      }
    }
    return this.findOne(id)
  }

  // The Hapus button lands here, not on remove(): a unit that has been sold keeps its documents
  // and its history, it just stops appearing in the register.
  async archive(id: string): Promise<FleetVehicleView> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')
    await this.repo.update(id, { isActive: false })
    return this.findOne(id)
  }

  // Restoring re-enters the partial unique index, so the plate has to be free again — another
  // unit may have taken it while this one was archived.
  async restore(id: string): Promise<FleetVehicleView> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')
    await this.assertNopolFree(existing.nopol, id)
    try {
      await this.repo.update(id, { isActive: true })
    } catch (err: unknown) {
      this.throwIfNopolViolation(err, existing.nopol)
      throw err
    }
    return this.findOne(id)
  }

  // Hard delete stays available so a mistyped entry can be cleaned up, but a unit that has
  // accumulated history cannot vanish — archiving is what that case wants.
  async remove(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')

    const docs = await this.docRepo.count({ where: { vehicleId: id } })
    if (docs > 0) {
      throw new ConflictException(
        `"${existing.nopol}" has ${docs} document record(s). Archive it instead of deleting.`,
      )
    }
    await this.repo.delete(id)
  }

  // The whole document set arrives at once because that is the shape of the form. A type present
  // in the payload with an unchanged expiry keeps its row; a changed expiry supersedes the old
  // row rather than overwriting it, which is what preserves the renewal history the prototype
  // threw away. A type absent from the payload is retired.
  async replaceDocuments(id: string, docs: DocumentInput[]): Promise<FleetVehicleView> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')

    const seen = new Set<string>()
    for (const doc of docs) {
      if (seen.has(doc.docTypeId)) {
        throw new BadRequestException(`Duplicate document type in payload: ${doc.docTypeId}`)
      }
      seen.add(doc.docTypeId)
    }
    await this.assertDocTypes([...seen])

    await this.dataSource.transaction(async (manager) => {
      // Everything is retired first, then the submitted set is inserted fresh. Doing it in this
      // order inside one transaction keeps uq_fleet_vehicle_documents_current satisfied at
      // commit time without needing to diff old against new.
      await manager.update(
        FleetVehicleDocumentEntity,
        { vehicleId: id, isCurrent: true },
        { isCurrent: false },
      )
      for (const doc of docs) {
        await manager.insert(FleetVehicleDocumentEntity, {
          vehicleId: id,
          docTypeId: doc.docTypeId,
          nomor: this.blankToNull(doc.nomor),
          issuedAt: doc.issuedAt || null,
          expiresAt: doc.expiresAt || null,
          isCurrent: true,
        })
      }
    })

    return this.findOne(id)
  }

  private applySort(
    qb: ReturnType<Repository<FleetVehicleEntity>['createQueryBuilder']>,
    sort?: FleetVehicleSort,
  ): void {
    switch (sort) {
      case '-nopol':
        qb.orderBy('v.nopol', 'DESC')
        break
      case 'tahun':
        qb.orderBy('v.tahun', 'ASC').addOrderBy('v.nopol', 'ASC')
        break
      case '-tahun':
        // COALESCE to 0 for the same reason the severity sort coalesces: tahun is nullable, and
        // Postgres puts NULLs FIRST on DESC, so "tahun terbaru" would open on every unit whose
        // year was never recorded. Ascending needs no guard — NULLs land last there already.
        qb.orderBy('COALESCE(v.tahun, 0)', 'DESC').addOrderBy('v.nopol', 'ASC')
        break
      case 'severity':
        // COALESCE to 3 so units with no dated document sort behind 'ok' rather than leading the
        // list as NULLs and burying the expired units this sort exists to surface.
        qb.orderBy('COALESCE(vs.severity_rank, 3)', 'ASC')
          .addOrderBy('vs.min_days_left', 'ASC')
          .addOrderBy('v.nopol', 'ASC')
        break
      default:
        qb.orderBy('v.nopol', 'ASC')
    }
  }

  private async loadViews(ids: string[]): Promise<FleetVehicleView[]> {
    const entities = await this.repo.find({
      where: { id: In(ids) },
      relations: {
        jenisArmada: true,
        kepemilikan: true,
        pool: true,
        status: true,
        driver: { simJenis: true },
      },
    })

    const docs = await this.docRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.docType', 'dt')
      .where('d.vehicleId IN (:...ids)', { ids })
      .andWhere('d.isCurrent = TRUE')
      .orderBy('dt.sortOrder', 'ASC')
      .getMany()

    const docsByVehicle = new Map<string, FleetVehicleDocumentEntity[]>()
    for (const doc of docs) {
      const list = docsByVehicle.get(doc.vehicleId) ?? []
      list.push(doc)
      docsByVehicle.set(doc.vehicleId, list)
    }

    // One `today` for the whole page so two rows on the same response can never be measured
    // against different days, which is possible if the request straddles midnight.
    const today = todayISO()
    const byId = new Map(entities.map((e) => [e.id, e]))

    // find() does not preserve the id order, and that order is the sort the caller asked for.
    return ids
      .map((id) => byId.get(id))
      .filter((e): e is FleetVehicleEntity => e !== undefined)
      .map((e) => this.toView(e, docsByVehicle.get(e.id) ?? [], today))
  }

  private toView(
    e: FleetVehicleEntity,
    docs: FleetVehicleDocumentEntity[],
    today: string,
  ): FleetVehicleView {
    const documents: FleetVehicleDocumentView[] = docs.map((d) => {
      const daysLeft = daysUntil(d.expiresAt, today)
      return {
        docTypeId: d.docTypeId,
        code: d.docType?.code ?? '',
        label: d.docType?.label ?? '',
        nomor: d.nomor,
        issuedAt: d.issuedAt,
        expiresAt: d.expiresAt,
        daysLeft,
        severity: severityFor(daysLeft, d.docType?.warnDays ?? null),
      }
    })

    const dated = documents.filter((d) => d.daysLeft !== null)

    // The driver's licence is deliberately left out of worstSeverity: it belongs to the person,
    // and the vehicle badge answers "are this unit's papers in order". Phase 4's alert list is
    // where the two are merged.
    const driver = e.driver
      ? {
          id: e.driver.id,
          nama: e.driver.nama,
          simExpiresAt: e.driver.simExpiresAt,
          simDaysLeft: daysUntil(e.driver.simExpiresAt, today),
          simSeverity: severityFor(
            daysUntil(e.driver.simExpiresAt, today),
            e.driver.simJenis?.warnDays ?? null,
          ),
        }
      : null

    return {
      id: e.id,
      nopol: e.nopol,
      merk: e.merk,
      tipe: e.tipe,
      tahun: e.tahun,
      kapasitas: e.kapasitas,
      noRangka: e.noRangka,
      noMesin: e.noMesin,
      noBpkb: e.noBpkb,
      pemilikUnit: e.pemilikUnit,
      odometer: e.odometer,
      catatan: e.catatan,
      jenisArmada: this.toRef(e.jenisArmada),
      kepemilikan: this.toRef(e.kepemilikan),
      pool: this.toRef(e.pool),
      status: this.toRef(e.status),
      driver,
      documents,
      worstSeverity: worstSeverity(documents.map((d) => d.severity)),
      minDaysLeft: dated.length > 0 ? Math.min(...dated.map((d) => d.daysLeft as number)) : null,
      isActive: e.isActive,
    }
  }

  private toRef(row?: FleetMasterDataEntity | null): FleetMasterRef | null {
    return row ? { id: row.id, label: row.label } : null
  }

  private async assertMasterRefs(dto: UpdateInput): Promise<void> {
    for (const [field, category] of Object.entries(MASTER_FIELD_CATEGORIES)) {
      const id = (dto as Record<string, unknown>)[field]
      if (typeof id !== 'string' || id === '') continue
      const row = await this.masterRepo.findOne({ where: { id, category } })
      if (!row) throw new BadRequestException(`${field} must reference a ${category} master row`)
    }
  }

  private async assertDocTypes(ids: string[]): Promise<void> {
    for (const id of ids) {
      const row = await this.masterRepo.findOne({ where: { id, category: 'jenis_dokumen' } })
      if (!row) throw new BadRequestException(`${id} is not a jenis_dokumen master row`)
    }
  }

  // Only live units hold a plate, matching uq_fleet_vehicles_nopol_active. An archived unit's
  // plate is free for reuse, which is the whole reason the index is partial.
  private async assertNopolFree(nopol: string, exceptId?: string): Promise<void> {
    const clash = await this.repo.findOne({
      where: exceptId
        ? { nopol, isActive: true, id: Not(exceptId) }
        : { nopol, isActive: true },
    })
    if (clash) {
      throw new ConflictException(`Plate "${nopol}" is already registered to an active vehicle`)
    }
  }

  // assertNopolFree is a check-then-act and still races a concurrent create. Translating the
  // loser's constraint violation makes both paths look the same to the caller instead of a 500.
  private throwIfNopolViolation(err: unknown, nopol: string): void {
    const pgErr = err as { code?: string; constraint?: string }
    if (pgErr?.code === UNIQUE_VIOLATION && pgErr?.constraint === NOPOL_UNIQUE_INDEX) {
      throw new ConflictException(`Plate "${nopol}" is already registered to an active vehicle`)
    }
  }

  // '' and whitespace-only collapse to null so each optional column has one empty state, not two.
  private blankToNull(v?: string | null): string | null {
    if (v == null) return null
    const trimmed = v.trim()
    return trimmed === '' ? null : trimmed
  }
}
