import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, FindOptionsWhere, Repository } from 'typeorm'
import { FleetMasterDataEntity } from './entities/fleet-master-data.entity'
import { FleetMasterCategory } from './fleet-master-data.constants'
import { CreateFleetMasterDataDto } from './dto/create-fleet-master-data.dto'
import { UpdateFleetMasterDataDto } from './dto/update-fleet-master-data.dto'

const UNIQUE_VIOLATION = '23505'
const CAT_CODE_UNIQUE_CONSTRAINT = 'uq_fleet_master_data_cat_code'

// Every column that points at fleet_master_data.id, so `remove` can tell an admin what they are
// about to break. Phase 1 ships this empty: fleet_vehicles does not exist yet, and probing a
// missing table would turn every delete into a 500. Phase 2 and 3 append their columns here —
// that is the single place a new reference has to be registered.
const REFERENCING_COLUMNS: { table: string; column: string }[] = []

@Injectable()
export class FleetMasterDataService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FleetMasterDataEntity)
    private readonly repo: Repository<FleetMasterDataEntity>,
  ) {}

  // Ordered by sort_order then label so an admin who leaves every sort_order at 0 still gets a
  // stable alphabetical list rather than insertion order.
  async findAll(
    category?: FleetMasterCategory,
    includeInactive = false,
  ): Promise<FleetMasterDataEntity[]> {
    const where: FindOptionsWhere<FleetMasterDataEntity> = {}
    if (category) where.category = category
    if (!includeInactive) where.isActive = true
    return this.repo.find({ where, order: { sortOrder: 'ASC', label: 'ASC' } })
  }

  async create(dto: CreateFleetMasterDataDto): Promise<FleetMasterDataEntity> {
    await this.assertCodeFree(dto.category, dto.code)
    try {
      return await this.repo.save(this.repo.create(dto as Partial<FleetMasterDataEntity>))
    } catch (err: unknown) {
      this.throwIfCodeUniqueViolation(err, dto.category, dto.code)
      throw err
    }
  }

  // `category` and `code` are deliberately not updatable. Both are the row's identity: vehicles
  // reference the row by id, but the seed migration and any future code path find it by
  // (category, code). Letting either move would relabel a dropdown entry out from under them.
  async update(id: string, dto: UpdateFleetMasterDataDto): Promise<FleetMasterDataEntity> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Master data row not found')

    const patch: UpdateFleetMasterDataDto = {}
    if (dto.label !== undefined) patch.label = dto.label
    if (dto.sortOrder !== undefined) patch.sortOrder = dto.sortOrder
    if (dto.isActive !== undefined) patch.isActive = dto.isActive
    if (dto.warnDays !== undefined) patch.warnDays = dto.warnDays
    if (dto.defaultValidMonths !== undefined) patch.defaultValidMonths = dto.defaultValidMonths
    if (dto.isRequired !== undefined) patch.isRequired = dto.isRequired

    if (Object.keys(patch).length > 0) await this.repo.update(id, patch)

    const updated = await this.repo.findOne({ where: { id } })
    if (!updated) throw new NotFoundException('Master data row not found')
    return updated
  }

  // Deleting a row a vehicle points at would either violate the FK or, worse, leave the vehicle
  // showing a blank dropdown. Deactivating is the answer and is always allowed, so the message
  // says so — the admin's actual goal is almost always "stop offering this", not "erase it".
  async remove(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Master data row not found')

    const usage = await this.countUsage(id)
    if (usage > 0) {
      throw new ConflictException(
        `"${existing.label}" is still used by ${usage} record(s). Deactivate it instead of deleting.`,
      )
    }
    await this.repo.delete(id)
  }

  private async countUsage(id: string): Promise<number> {
    if (REFERENCING_COLUMNS.length === 0) return 0

    const unions = REFERENCING_COLUMNS.map(
      (r) => `SELECT count(*) AS c FROM ${r.table} WHERE ${r.column} = $1`,
    ).join(' UNION ALL ')
    const rows = (await this.dataSource.query(
      `SELECT COALESCE(SUM(c), 0) AS count FROM (${unions}) t`,
      [id],
    )) as { count: string }[]
    return Number(rows[0]?.count ?? 0)
  }

  private async assertCodeFree(category: FleetMasterCategory, code: string): Promise<void> {
    const clash = await this.repo.findOne({ where: { category, code } })
    if (clash) {
      throw new ConflictException(`Code "${code}" already exists under category "${category}"`)
    }
  }

  // assertCodeFree is a check-then-act and still races two concurrent creates. Catching the
  // loser's constraint violation here makes both paths look identical to the caller instead of
  // surfacing a raw 500.
  private throwIfCodeUniqueViolation(err: unknown, category: FleetMasterCategory, code: string): void {
    const pgErr = err as { code?: string; constraint?: string }
    if (pgErr?.code === UNIQUE_VIOLATION && pgErr?.constraint === CAT_CODE_UNIQUE_CONSTRAINT) {
      throw new ConflictException(`Code "${code}" already exists under category "${category}"`)
    }
  }
}
