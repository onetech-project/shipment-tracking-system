// 'none' is a vehicle with no dated current document at all — distinct from 'ok', which means
// every document is dated and comfortably in the future.
export const FLEET_SEVERITIES = ['crit', 'warn', 'ok', 'none'] as const

export type FleetSeverity = (typeof FLEET_SEVERITIES)[number]

// A closed list, not free text: ?sort= reaches ORDER BY, so anything unlisted must be rejected
// by the DTO rather than interpolated.
export const FLEET_VEHICLE_SORTS = ['nopol', '-nopol', 'severity', 'tahun', '-tahun'] as const

export type FleetVehicleSort = (typeof FLEET_VEHICLE_SORTS)[number]

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

// The one kepemilikan code the service branches on: a rented unit has an owner outside the
// company, and requirement §2 makes naming them mandatory for exactly that case. Matched by code
// rather than by id because ids differ per environment while the seeded code does not.
export const SEWA_LEPAS_KUNCI_CODE = 'sewa_lepas_kunci'
