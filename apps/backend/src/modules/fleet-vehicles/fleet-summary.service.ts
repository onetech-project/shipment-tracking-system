import { Injectable } from '@nestjs/common'
import { FleetVehiclesService } from './fleet-vehicles.service'
import { FleetSummary } from './fleet-vehicles.types'

// Large enough to cover the whole register in one pass. This is a summary of every unit, not of a
// page, and the register is in the hundreds — a fleet that outgrows this wants a SQL aggregate,
// and the tests above pin the arithmetic so that swap stays honest.
const SUMMARY_PAGE_SIZE = 1000

@Injectable()
export class FleetSummaryService {
  constructor(private readonly vehicles: FleetVehiclesService) {}

  // Built from the same views the list renders, so a tile and the rows beneath it can never
  // disagree about a unit's severity — a second query with its own severity ladder is exactly how
  // that drift starts.
  async summary(): Promise<FleetSummary> {
    const { rows } = await this.vehicles.findAll({
      page: 1,
      pageSize: SUMMARY_PAGE_SIZE,
      includeArchived: false,
    })

    let dokumenKedaluwarsa = 0
    let jatuhTempo30Hari = 0
    let cicilanPerBulan = 0
    let sisaKewajiban = 0

    for (const row of rows) {
      if (row.worstSeverity === 'crit') dokumenKedaluwarsa += 1
      else if (row.worstSeverity === 'warn') jatuhTempo30Hari += 1

      // Only a contract with instalments still to run. A settled one is history and reporting it
      // would overstate what the company owes.
      if (row.lease && row.lease.sisaAngsuran > 0) {
        cicilanPerBulan += row.lease.cicilanPerBulan ?? 0
        sisaKewajiban += row.lease.sisaKewajiban
      }
    }

    return {
      totalUnit: rows.length,
      dokumenKedaluwarsa,
      jatuhTempo30Hari,
      cicilanPerBulan,
      sisaKewajiban,
    }
  }
}
