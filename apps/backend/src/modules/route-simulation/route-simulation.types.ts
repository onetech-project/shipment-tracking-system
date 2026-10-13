import { DateBasis } from '../pnl/pnl-filter.util'
import { RouteGroup } from '../route-groups/route-groups.service'

export interface SimulationRoute {
  origin: string // raw station, e.g. 'Jabo'
  originLabel: string // display, e.g. 'CGK'
  dest: string
  // From the DC-pair master's extra_fields. Null when the master has no row for a pair that TOs
  // nevertheless carry (FULL JOIN), or the cell is blank. The engine's default rate per kg is
  // rateSpx - pph2 - disc15, the same net figure v_pnl_to bills.
  rateSpx: number | null
  pph2: number | null
  disc15: number | null
  hasData: boolean // the pair appears in v_pnl_to
}

export interface SimulationVendor {
  vendor: string // raw, byte-identical to v_pnl_to.vendor
  inMaster: boolean // present in air_shipments_smu
  hasData: boolean // present in v_pnl_to
}

// One cycle × route × vendor × airline cell, TO grain. vendor/airline null = TOs with no booking;
// they carry real weight and revenue and must count toward route tonnage.
export interface SimulationHistoryRow {
  cycle: string // YYYY-MM-1H | YYYY-MM-2H on the requested basis
  origin: string
  dest: string
  vendor: string | null
  airline: string | null
  awbCount: number
  weight: number // SUM(gross_weight)
  revenue: number // net of revenue_discount
  costAll: number // COALESCE(SUM(cost_to)), reconciles with /pnl/summary
  // Lane-cost inputs: only TOs whose cost is known AND booked (not the route fallback). A lane's
  // cost/kg per component = laneCostX / laneWeight. Kept apart from costAll so an estimated or
  // missing cost can never masquerade as a cheap lane. The four components add up to cost_to.
  laneWeight: number
  laneCostSgOut: number
  laneCostSgIn: number
  laneCostRa: number
  laneCostSmu: number
}

export interface SimulationSource {
  basis: DateBasis
  cycles: string[] // ascending, every cycle that has at least one history row
  routes: SimulationRoute[]
  routeGroups: RouteGroup[]
  vendors: SimulationVendor[]
  history: SimulationHistoryRow[]
}

export interface ScenarioSummary {
  id: string
  name: string
  description: string | null
  revision: number
  updatedAt: string // ISO
  updatedBy: string | null // username, null when the user was deleted
}

export interface ScenarioDetail extends ScenarioSummary {
  payload: Record<string, unknown>
}
