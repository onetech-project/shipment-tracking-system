import type { CostField } from '../types'

export const ESP_CASHBACK = 0.02
export const DAYS_PER_PERIOD = 15
export const DAYS_PER_MONTH = 30
export const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const NO_GROUP = { id: 'none', name: 'Tanpa Grup' } as const
// The display name for history rows with no booking. Never an account id: accounts are vendors.
export const UNBOOKED_LABEL = 'Tanpa booking'

// v_pnl_to adds cost_to up in this order; tab 2 shows the columns in it.
export const COST_FIELDS: CostField[] = ['costSgOut', 'costSgIn', 'costRa', 'costSmu']
export const COST_LABELS: Record<CostField, string> = { costSgOut: 'SG Outgoing', costSgIn: 'SG Incoming', costRa: 'RA', costSmu: 'SMU' }

export const DEFAULT_HORIZON_PERIODS = 12
export const MAX_HORIZON_PERIODS = 72
