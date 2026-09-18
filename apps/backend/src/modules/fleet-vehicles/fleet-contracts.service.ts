import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FleetLeaseContractEntity } from './entities/fleet-lease-contract.entity'
import { computeLease } from './fleet-lease'
import { todayISO } from './fleet-severity'
import { FleetVehicleLeaseView } from './fleet-vehicles.types'

// Reading and closing only. Contracts are OPENED through the vehicle form, so that the vehicle,
// its papers and its financing land in one transaction — a second way to open one would let a
// unit acquire two open contracts through two endpoints racing the partial unique index.
@Injectable()
export class FleetContractsService {
  constructor(
    @InjectRepository(FleetLeaseContractEntity)
    private readonly repo: Repository<FleetLeaseContractEntity>,
  ) {}

  // Open first, then closed newest-first: the current obligation is what the operator opened the
  // panel for, and the history sits beneath it.
  async list(vehicleId: string): Promise<FleetVehicleLeaseView[]> {
    const rows = await this.repo.find({
      where: { vehicleId },
      relations: { leasing: true },
      order: { closedAt: 'ASC', createdAt: 'DESC' },
    })
    return rows.map((row) => this.toView(row))
  }

  async close(id: string): Promise<FleetVehicleLeaseView> {
    const row = await this.repo.findOne({ where: { id }, relations: { leasing: true } })
    if (!row) throw new NotFoundException('Contract not found')
    // Closing an already-closed contract would move the date and rewrite when the obligation
    // actually ended.
    if (row.closedAt) throw new ConflictException('Contract is already closed')

    await this.repo.update(id, { closedAt: todayISO() })
    const reloaded = await this.repo.findOne({ where: { id }, relations: { leasing: true } })
    if (!reloaded) throw new NotFoundException('Contract not found')
    return this.toView(reloaded)
  }

  // Deliberately the same shape and the same arithmetic as the lease block on the vehicle view:
  // two ways to compute an instalment count is how the two screens start disagreeing.
  private toView(row: FleetLeaseContractEntity): FleetVehicleLeaseView {
    const cicilan = row.cicilanPerBulan == null ? null : Number(row.cicilanPerBulan)
    const totals = computeLease({
      cicilanPerBulan: cicilan,
      tenorBulan: row.tenorBulan,
      angsuranMulai: row.angsuranMulai,
      angsuranTerbayarOverride: row.angsuranTerbayarOverride,
    })
    return {
      id: row.id,
      leasing: row.leasing
        ? { id: row.leasing.id, code: row.leasing.code, label: row.leasing.label }
        : null,
      nomorKontrak: row.nomorKontrak,
      cicilanPerBulan: cicilan,
      tenorBulan: row.tenorBulan,
      angsuranMulai: row.angsuranMulai,
      angsuranTerbayarOverride: row.angsuranTerbayarOverride,
      closedAt: row.closedAt,
      ...totals,
    }
  }
}
