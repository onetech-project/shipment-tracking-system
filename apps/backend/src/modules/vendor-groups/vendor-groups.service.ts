import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { VendorGroupEntity } from './entities/vendor-group.entity'
import { VendorGroupVendorEntity } from './entities/vendor-group-vendor.entity'
import { CreateVendorGroupDto } from './dto/create-vendor-group.dto'
import { UpdateVendorGroupDto } from './dto/update-vendor-group.dto'

export interface AvailableVendor {
  vendor: string // raw name, byte-identical to what v_pnl_to.vendor holds
  hasData: boolean // appears in v_pnl_to; false means a group holding it renders an empty column
  inMaster: boolean // appears in air_shipments_smu; false = booked with no rate-card row at all
}

export interface VendorGroup {
  id: string
  name: string
  description: string | null
  vendors: string[]
}

const UNIQUE_VIOLATION = '23505'
const NAME_UNIQUE_CONSTRAINT = 'uq_vendor_groups_name'

@Injectable()
export class VendorGroupsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(VendorGroupEntity)
    private readonly groupRepo: Repository<VendorGroupEntity>,
  ) {}

  // A genuine union of the rate-card master and the values TOs actually carry, not a LEFT JOIN
  // from the master the way getAvailableRoutes does it. Route Group can be master-only because its
  // containment was measured and holds; the vendor equivalent is recorded in the spec's Kelayakan
  // section. Nothing proves a booked vendor is missing from the master today — smu_rate_missing
  // does not, since it fires on a miss over the whole (vendor, airlines, origin, destination) key
  // rather than on the vendor alone — but the master is a Google-Sheet snapshot rewritten on every
  // sync, so that measurement is a fact about today's sheet, not about the schema. The moment a
  // sync drops a vendor that TOs already reference, a master-only list makes it unselectable — and
  // the group that names it silently empties. The union costs nothing and removes that dependency.
  //
  // Names are taken raw. The only exclusions are NULL and '', written as an explicit comparison
  // rather than NULLIF(BTRIM(...)): trimming here would store a value that no longer equals
  // v_pnl_to.vendor, and the comparison join would silently miss every row.
  async getAvailableVendors(): Promise<AvailableVendor[]> {
    const rows = await this.dataSource.query(`
      WITH master AS (
        SELECT DISTINCT vendor FROM air_shipments_smu
        WHERE vendor IS NOT NULL AND vendor <> ''
      ),
      used AS (
        SELECT DISTINCT vendor FROM v_pnl_to
        WHERE vendor IS NOT NULL AND vendor <> ''
      )
      SELECT v.vendor,
             (v.vendor IN (SELECT vendor FROM used))   AS has_data,
             (v.vendor IN (SELECT vendor FROM master)) AS in_master
      FROM (SELECT vendor FROM master UNION SELECT vendor FROM used) v
      ORDER BY v.vendor
    `)

    return (rows as { vendor: string; has_data: boolean; in_master: boolean }[]).map((r) => ({
      vendor: r.vendor,
      hasData: r.has_data,
      inMaster: r.in_master,
    }))
  }

  // One flat query rather than a TypeORM relation load: the row count is tiny and a join keeps
  // vendor ordering under this method's control.
  async findAll(): Promise<VendorGroup[]> {
    const rows = await this.dataSource.query(`
      SELECT g.id, g.name, g.description, v.vendor
      FROM vendor_groups g
      LEFT JOIN vendor_group_vendors v ON v.vendor_group_id = g.id
      ORDER BY g.name, v.vendor
    `)

    const byId = new Map<string, VendorGroup>()
    for (const row of rows as Record<string, string | null>[]) {
      const id = row.id as string
      let group = byId.get(id)
      if (!group) {
        group = { id, name: row.name as string, description: row.description, vendors: [] }
        byId.set(id, group)
      }
      // The LEFT JOIN yields one all-null row for a group whose vendors were removed. Tested for
      // NULL rather than for truthiness so that a vendor name is never dropped for looking empty —
      // names are raw text and this method is not a filter.
      if (row.vendor !== null && row.vendor !== undefined) group.vendors.push(row.vendor)
    }
    return [...byId.values()]
  }

  async create(dto: CreateVendorGroupDto): Promise<VendorGroup> {
    await this.assertVendorsExist(dto.vendors)
    await this.assertNameFree(dto.name)

    let groupId: string
    try {
      groupId = await this.dataSource.transaction(async (manager) => {
        const groupRepo = manager.getRepository(VendorGroupEntity)
        const group = await groupRepo.save(
          groupRepo.create({
            name: dto.name,
            description: this.normalizeDescription(dto.description),
          }),
        )
        await this.replaceVendors(manager, group.id, dto.vendors)
        return group.id
      })
    } catch (err: unknown) {
      this.throwIfNameUniqueViolation(err, dto.name)
      throw err
    }

    return this.findOneOrThrow(groupId)
  }

  private async findOneOrThrow(id: string): Promise<VendorGroup> {
    const group = (await this.findAll()).find((g) => g.id === id)
    if (!group) throw new NotFoundException('Vendor group not found')
    return group
  }

  private async assertNameFree(name: string): Promise<void> {
    const clash = await this.groupRepo.findOne({ where: { name } })
    if (clash) throw new ConflictException(`A vendor group named "${name}" already exists`)
  }

  // Rejects a vendor that neither the rate card nor any TO has ever mentioned: it could only ever
  // render as a column of em-dashes. The comparison is exact — case-sensitive, whitespace-sensitive
  // — because the stored string has to equal v_pnl_to.vendor for the comparison query to find it.
  // Accepting a near-match here would store a name that silently aggregates to nothing.
  private async assertVendorsExist(vendors: string[]): Promise<void> {
    const available = await this.getAvailableVendors()
    const known = new Set(available.map((v) => v.vendor))
    for (const vendor of vendors) {
      if (!known.has(vendor)) {
        throw new ConflictException(`Unknown vendor: ${vendor}`)
      }
    }
  }

  // Deletes and re-inserts inside the caller's transaction so the group write and its membership
  // rows commit or roll back together. De-duplicated first: the composite primary key means sending
  // the same name twice would throw partway through the insert, after the delete had already
  // happened, leaving the group with no vendors at all. That de-dupe is about the key, not about
  // ordering: findAll re-reads with ORDER BY g.name, v.vendor, so what the API returns is
  // alphabetical regardless of the order the admin ticked boxes in.
  private async replaceVendors(
    manager: EntityManager,
    groupId: string,
    vendors: string[],
  ): Promise<void> {
    const vendorRepo = manager.getRepository(VendorGroupVendorEntity)
    const unique = [...new Set(vendors)]

    await vendorRepo.delete({ vendorGroupId: groupId })
    await vendorRepo.insert(unique.map((vendor) => ({ vendorGroupId: groupId, vendor })))
  }

  // '' and whitespace-only are folded into null so the column has one empty state instead of two.
  // This applies to the group's own description only — never to a vendor name.
  private normalizeDescription(description?: string | null): string | null {
    if (description == null) return null
    const trimmed = description.trim()
    return trimmed === '' ? null : trimmed
  }

  // assertNameFree is a check-then-act and so still races two concurrent creates. This catches the
  // loser's constraint violation and reshapes it into the same ConflictException the pre-check
  // produces, so both paths look identical to the caller instead of surfacing a raw 500.
  private throwIfNameUniqueViolation(err: unknown, name: string): void {
    const pgErr = err as { code?: string; constraint?: string }
    if (pgErr?.code === UNIQUE_VIOLATION && pgErr?.constraint === NAME_UNIQUE_CONSTRAINT) {
      throw new ConflictException(`A vendor group named "${name}" already exists`)
    }
  }
}
