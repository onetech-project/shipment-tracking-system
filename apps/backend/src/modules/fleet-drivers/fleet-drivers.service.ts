import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FleetDriverEntity } from './entities/fleet-driver.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { FleetVehicleEntity } from '../fleet-vehicles/entities/fleet-vehicle.entity'

interface CreateInput {
  nama: string
  telepon?: string | null
  simNomor?: string | null
  simJenisId?: string | null
  simExpiresAt?: string | null
}

interface UpdateInput extends Partial<CreateInput> {
  isActive?: boolean
}

@Injectable()
export class FleetDriversService {
  constructor(
    @InjectRepository(FleetDriverEntity)
    private readonly repo: Repository<FleetDriverEntity>,
    @InjectRepository(FleetMasterDataEntity)
    private readonly masterRepo: Repository<FleetMasterDataEntity>,
    @InjectRepository(FleetVehicleEntity)
    private readonly vehicleRepo: Repository<FleetVehicleEntity>,
  ) {}

  async findAll(q?: string, includeInactive = false): Promise<FleetDriverEntity[]> {
    const qb = this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.simJenis', 'sim')
      .where('1 = 1')

    // Property names, not column names: the query builder maps d.isActive to "d"."is_active".
    if (!includeInactive) qb.andWhere('d.isActive = TRUE')
    if (q?.trim()) {
      qb.andWhere('(d.nama ILIKE :q OR d.telepon ILIKE :q OR d.simNomor ILIKE :q)', {
        q: `%${q.trim()}%`,
      })
    }
    return qb.orderBy('d.nama', 'ASC').getMany()
  }

  async create(dto: CreateInput): Promise<FleetDriverEntity> {
    await this.assertSimJenisValid(dto.simJenisId)
    return this.repo.save(
      this.repo.create({
        nama: dto.nama.trim(),
        telepon: this.blankToNull(dto.telepon),
        simNomor: this.blankToNull(dto.simNomor),
        simJenisId: dto.simJenisId ?? null,
        simExpiresAt: dto.simExpiresAt ?? null,
      }),
    )
  }

  async update(id: string, dto: UpdateInput): Promise<FleetDriverEntity> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Driver not found')

    if (dto.simJenisId) await this.assertSimJenisValid(dto.simJenisId)

    // Built key by key rather than spreading the DTO: an absent field must leave the column
    // alone, while an explicit null must clear it. Spreading would collapse that distinction.
    const patch: Record<string, unknown> = {}
    if (dto.nama !== undefined) patch.nama = dto.nama.trim()
    if (dto.telepon !== undefined) patch.telepon = this.blankToNull(dto.telepon)
    if (dto.simNomor !== undefined) patch.simNomor = this.blankToNull(dto.simNomor)
    if (dto.simJenisId !== undefined) patch.simJenisId = dto.simJenisId
    if (dto.simExpiresAt !== undefined) patch.simExpiresAt = dto.simExpiresAt
    if (dto.isActive !== undefined) patch.isActive = dto.isActive

    if (Object.keys(patch).length > 0) await this.repo.update(id, patch)

    const updated = await this.repo.findOne({ where: { id } })
    if (!updated) throw new NotFoundException('Driver not found')
    return updated
  }

  // fleet_vehicles.driver_id is ON DELETE SET NULL, so deleting an assigned driver would not
  // error — the vehicle would quietly lose its driver and nobody would find out until someone
  // went looking. An assigned driver is archived instead; one nobody has ever been assigned to
  // is still deletable outright, so a typo does not become a permanent archived row.
  async remove(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Driver not found')

    const assigned = await this.vehicleRepo.count({ where: { driverId: id } })
    if (assigned > 0) {
      await this.repo.update(id, { isActive: false })
      return
    }
    await this.repo.delete(id)
  }

  async restore(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Driver not found')
    await this.repo.update(id, { isActive: true })
  }

  // The foreign key proves the id exists in fleet_master_data; it cannot prove the row is a
  // licence class. Without this a driver could be saved pointing at "Pool Cakung".
  private async assertSimJenisValid(id?: string | null): Promise<void> {
    if (!id) return
    const row = await this.masterRepo.findOne({ where: { id, category: 'jenis_sim' } })
    if (!row) throw new BadRequestException('simJenisId must reference a jenis_sim master row')
  }

  // '' and whitespace-only collapse to null so each optional column has one empty state, not two.
  private blankToNull(v?: string | null): string | null {
    if (v == null) return null
    const trimmed = v.trim()
    return trimmed === '' ? null : trimmed
  }
}
