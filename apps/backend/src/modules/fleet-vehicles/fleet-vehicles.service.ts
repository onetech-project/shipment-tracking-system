import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
import { FleetLeaseContractEntity } from './entities/fleet-lease-contract.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { FleetMasterCategory } from '../fleet-master-data/fleet-master-data.constants'
import {
  DEFAULT_PAGE_SIZE,
  FleetSeverity,
  FleetVehicleSort,
  MAX_PAGE_SIZE,
  SEWA_LEPAS_KUNCI_CODE,
} from './fleet-vehicles.constants'
import { normalizeNopol } from './fleet-nopol'
import { computeLease } from './fleet-lease'
import { daysUntil, severityFor, todayISO, worstSeverity } from './fleet-severity'
import {
  FleetMasterRef,
  FleetVehicleDocumentView,
  FleetVehicleLeaseView,
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
  // Present means "make this the open contract". Explicit null means "this unit is no longer
  // financed" — the distinction update() relies on, which is why this is not just optional.
  lease?: LeaseInput | null
  documents?: DocumentInput[]
}

export type UpdateInput = Partial<CreateInput>

export interface DocumentInput {
  docTypeId: string
  nomor?: string | null
  issuedAt?: string | null
  expiresAt?: string | null
}

export interface LeaseInput {
  leasingId: string
  nomorKontrak: string
  cicilanPerBulan: number
  tenorBulan: number
  angsuranMulai: string
  angsuranTerbayar?: number | null
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
    @InjectRepository(FleetLeaseContractEntity)
    private readonly leaseRepo: Repository<FleetLeaseContractEntity>,
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

  // Vehicle, contract and documents go in together or not at all. Splitting them would let a
  // unit land in the register with no papers whenever the second write fails, leaving the
  // operator to guess which half to redo.
  async create(dto: CreateInput): Promise<FleetVehicleView> {
    const nopol = normalizeNopol(dto.nopol)
    if (!nopol) throw new BadRequestException('nopol must not be blank')

    await this.assertMasterRefs(dto)
    await this.assertOwnerNamedWhenRented(dto.kepemilikanId, dto.pemilikUnit)
    await this.assertDocumentPayload(dto.documents)
    await this.assertNopolFree(nopol)

    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const saved = (await manager.save(FleetVehicleEntity, {
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
        })) as { id: string }

        if (dto.lease) await this.openContract(manager, saved.id, dto.lease)
        if (dto.documents) await this.writeDocuments(manager, saved.id, dto.documents)
        return saved.id
      })
      return this.findOne(id)
    } catch (err: unknown) {
      this.throwIfNopolViolation(err, nopol)
      throw err
    }
  }

  async update(id: string, dto: UpdateInput): Promise<FleetVehicleView> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')

    await this.assertMasterRefs(dto)

    // The rented-unit rule is checked against whatever the row will hold after this patch, not
    // against the patch alone: changing only kepemilikan to sewa must still demand an owner, and
    // clearing only pemilikUnit on an already-rented unit must be refused.
    await this.assertOwnerNamedWhenRented(
      dto.kepemilikanId !== undefined ? dto.kepemilikanId : existing.kepemilikanId,
      dto.pemilikUnit !== undefined ? dto.pemilikUnit : existing.pemilikUnit,
    )
    await this.assertDocumentPayload(dto.documents)

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

    const touchesLease = dto.lease !== undefined
    const touchesDocs = dto.documents !== undefined

    if (Object.keys(patch).length > 0 || touchesLease || touchesDocs) {
      try {
        await this.dataSource.transaction(async (manager) => {
          if (Object.keys(patch).length > 0) {
            await manager.update(FleetVehicleEntity, id, patch)
          }
          if (touchesLease) {
            // Closed, never overwritten: a refinanced unit keeps what it used to pay. null means
            // the unit is no longer financed, so the old contract closes with no replacement.
            const open = await manager.findOne(FleetLeaseContractEntity, {
              where: { vehicleId: id, closedAt: IsNull() },
            })
            // The form posts the lease block on every save, so "the key is present" is not the
            // same as "the operator changed the financing". Closing and reopening an identical
            // contract would stack a closed row on every odometer edit and bury the credit
            // history the closing mechanism exists to keep.
            if (!this.sameContract(open, dto.lease ?? null)) {
              if (open) {
                await manager.update(FleetLeaseContractEntity, open.id, { closedAt: todayISO() })
              }
              if (dto.lease) await this.openContract(manager, id, dto.lease)
            }
          }
          if (touchesDocs) await this.writeDocuments(manager, id, dto.documents ?? [])
        })
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

  // The whole document set replaces the old one, because that is the shape of the form. Kept
  // alongside the combined endpoint for quick renewals that do not need the full form open.
  async replaceDocuments(id: string, docs: DocumentInput[]): Promise<FleetVehicleView> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')

    await this.assertDocumentPayload(docs)
    await this.dataSource.transaction((manager) => this.writeDocuments(manager, id, docs))
    return this.findOne(id)
  }

  // A type present with an unchanged expiry keeps its row; a changed expiry supersedes the old
  // row rather than overwriting it, which is what preserves the renewal history the prototype
  // threw away. Everything is retired first, then the submitted set is inserted fresh: in that
  // order, inside one transaction, uq_fleet_vehicle_documents_current holds at commit time
  // without having to diff old against new.
  private async writeDocuments(
    manager: EntityManager,
    vehicleId: string,
    docs: DocumentInput[],
  ): Promise<void> {
    await manager.update(
      FleetVehicleDocumentEntity,
      { vehicleId, isCurrent: true },
      { isCurrent: false },
    )
    for (const doc of docs) {
      await manager.insert(FleetVehicleDocumentEntity, {
        vehicleId,
        docTypeId: doc.docTypeId,
        nomor: this.blankToNull(doc.nomor),
        issuedAt: doc.issuedAt || null,
        expiresAt: doc.expiresAt || null,
        isCurrent: true,
      })
    }
  }

  private async openContract(
    manager: EntityManager,
    vehicleId: string,
    lease: LeaseInput,
  ): Promise<void> {
    await manager.save(FleetLeaseContractEntity, {
      vehicleId,
      leasingId: lease.leasingId,
      nomorKontrak: this.blankToNull(lease.nomorKontrak),
      cicilanPerBulan: lease.cicilanPerBulan == null ? null : String(lease.cicilanPerBulan),
      tenorBulan: lease.tenorBulan ?? null,
      angsuranMulai: lease.angsuranMulai || null,
      // Blank means "derive it from the start date" (spec §5.2), so an absent value must reach
      // the column as null rather than as 0 — 0 is a real answer meaning nothing has been paid.
      angsuranTerbayarOverride: lease.angsuranTerbayar ?? null,
      closedAt: null,
    })
  }

  // Whether the incoming lease block describes the contract already open on this unit. The two
  // sides arrive in different shapes — the DTO carries JSON numbers and strings, while pg hands
  // numeric back as a string and date back as either a string or a Date depending on the driver
  // — so each field is normalised before it is compared. A raw === would report "different"
  // every time and close a contract on every save.
  private sameContract(open: FleetLeaseContractEntity | null, lease: LeaseInput | null): boolean {
    if (!open || !lease) return !open && !lease
    return (
      (open.leasingId ?? null) === (lease.leasingId ?? null) &&
      this.blankToNull(open.nomorKontrak) === this.blankToNull(lease.nomorKontrak) &&
      this.sameAmount(open.cicilanPerBulan, lease.cicilanPerBulan) &&
      (open.tenorBulan ?? null) === (lease.tenorBulan ?? null) &&
      this.sameDate(open.angsuranMulai, lease.angsuranMulai) &&
      (open.angsuranTerbayarOverride ?? null) === (lease.angsuranTerbayar ?? null)
    )
  }

  // numeric(14,2) reads back as '8750000.00' but is typed as 8750000, so the two are compared as
  // numbers. String equality here would treat every unchanged instalment as a change.
  private sameAmount(stored: string | null, incoming: number | null | undefined): boolean {
    if (stored == null || incoming == null) return stored == null && incoming == null
    return Number(stored) === Number(incoming)
  }

  // A date column can surface as 'YYYY-MM-DD' or as a Date, depending on the driver's parser
  // settings, and the DTO always sends an ISO string. Both are reduced to the calendar day.
  private sameDate(stored: string | Date | null, incoming: string | null | undefined): boolean {
    const left = this.toDateISO(stored)
    const right = this.toDateISO(incoming ?? null)
    return left === right
  }

  private toDateISO(v: string | Date | null): string | null {
    if (v == null) return null
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    const trimmed = v.trim()
    return trimmed === '' ? null : trimmed.slice(0, 10)
  }

  // Duplicate types and unknown types are both rejected before any write starts, so a bad payload
  // never gets as far as a half-applied transaction.
  private async assertDocumentPayload(docs?: DocumentInput[]): Promise<void> {
    if (!docs) return
    const seen = new Set<string>()
    for (const doc of docs) {
      if (seen.has(doc.docTypeId)) {
        throw new BadRequestException(`Duplicate document type in payload: ${doc.docTypeId}`)
      }
      seen.add(doc.docTypeId)
    }
    await this.assertDocTypes([...seen])
    await this.assertRequiredDocuments(docs)
  }

  // Spec §5.1: the types master data marks is_required must arrive with an expiry date, because
  // the expiry is what every reminder and every badge is computed from — a row with a number and
  // no date is invisible to all of them. The flag is read from master data rather than hardcoded
  // so an admin can change the policy from the Master Data screen. is_required is nullable and a
  // type an admin adds is born NULL, so only an explicit TRUE demands a date.
  private async assertRequiredDocuments(docs: DocumentInput[]): Promise<void> {
    const required = await this.masterRepo.find({
      where: { category: 'jenis_dokumen', isRequired: true },
    })
    if (required.length === 0) return

    const datedTypes = new Set(
      docs.filter((d) => this.blankToNull(d.expiresAt)).map((d) => d.docTypeId),
    )
    const missing = required.filter((row) => !datedTypes.has(row.id))
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing expiry date for required document type(s): ${missing
          .map((row) => row.label || row.code)
          .join(', ')}`,
      )
    }
  }

  // Requirement §2: a rented unit belongs to someone outside the company, and a register that
  // does not name them cannot answer who the truck goes back to. Checked here rather than in the
  // DTO because it needs the kepemilikan row's code, and a DTO has no repository.
  private async assertOwnerNamedWhenRented(
    kepemilikanId?: string | null,
    pemilikUnit?: string | null,
  ): Promise<void> {
    if (!kepemilikanId) return
    if (this.blankToNull(pemilikUnit)) return
    const row = await this.masterRepo.findOne({
      where: { id: kepemilikanId, category: 'kepemilikan' },
    })
    if (row?.code === SEWA_LEPAS_KUNCI_CODE) {
      throw new BadRequestException('pemilikUnit is required for a sewa lepas kunci vehicle')
    }
  }

  private toLeaseView(row: FleetLeaseContractEntity | null): FleetVehicleLeaseView | null {
    if (!row) return null
    // pg hands numeric back as a string. Parsed once here so no consumer has to decide how.
    const cicilan = row.cicilanPerBulan == null ? null : Number(row.cicilanPerBulan)
    const totals = computeLease({
      cicilanPerBulan: cicilan,
      tenorBulan: row.tenorBulan,
      angsuranMulai: row.angsuranMulai,
      angsuranTerbayarOverride: row.angsuranTerbayarOverride,
    })
    return {
      id: row.id,
      leasing: this.toRef(row.leasing),
      nomorKontrak: row.nomorKontrak,
      cicilanPerBulan: cicilan,
      tenorBulan: row.tenorBulan,
      angsuranMulai: row.angsuranMulai,
      angsuranTerbayarOverride: row.angsuranTerbayarOverride,
      ...totals,
    }
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

    // Only the open contract. Closed ones are history and have no figures to report.
    const leases = await this.leaseRepo.find({
      where: { vehicleId: In(ids), closedAt: IsNull() },
      relations: { leasing: true },
    })
    const leaseByVehicle = new Map(leases.map((l) => [l.vehicleId, l]))

    // One `today` for the whole page so two rows on the same response can never be measured
    // against different days, which is possible if the request straddles midnight.
    const today = todayISO()
    const byId = new Map(entities.map((e) => [e.id, e]))

    // find() does not preserve the id order, and that order is the sort the caller asked for.
    return ids
      .map((id) => byId.get(id))
      .filter((e): e is FleetVehicleEntity => e !== undefined)
      .map((e) => this.toView(e, docsByVehicle.get(e.id) ?? [], today, leaseByVehicle.get(e.id) ?? null))
  }

  private toView(
    e: FleetVehicleEntity,
    docs: FleetVehicleDocumentEntity[],
    today: string,
    lease: FleetLeaseContractEntity | null,
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
      lease: this.toLeaseView(lease),
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
