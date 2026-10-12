import type { ElementType } from 'react'
import {
  AlertTriangle,
  Anchor,
  Clock,
  Hourglass,
  Plane,
  PlaneLanding,
  Ship,
  ShieldAlert,
  Timer,
} from 'lucide-react'
import { SLA_FROZEN_KEYS, SLA_DEFAULT_VISIBLE } from './columns.config'
import { CHART_COLORS } from '@/lib/chart-colors'

// Categorical colors for each alert type, taken from the app's CHART_COLORS palette so the
// Alerts-by-Route table legend (RouteAlertTable) and the excluded-alert pills (SlaPage) stay
// on-system. Index meaning: 0 good/brand, 1 brand-alt, 3 dark, 4 brand-dark, 6 warn, 7 bad.
const GOOD = CHART_COLORS[0]
const BRAND_ALT = CHART_COLORS[1]
const DARK = CHART_COLORS[3]
const BRAND_DARK = CHART_COLORS[4]
const WARN = CHART_COLORS[6]
const BAD = CHART_COLORS[7]
// The SLA/TJPH alert pairs need distinguishable hues within the same warn/bad family (matching
// the mockup's own `.alert-kpi.pot`/`.pot-t`/`.bre`/`.tjph` choices) — not in CHART_COLORS, so
// kept as literal hex, one shade lighter/darker than WARN/BAD on each side of the pair.
const WARN_TJPH = '#eab308'
const BAD_TJPH = '#b91c1c'

/** One alert type as displayed by the SLA page (cards, dropdown, route table, badges). */
export interface SlaAlertDef {
  key: string
  label: string
  /** Compact header used by the Alerts-by-Route table. */
  shortLabel: string
  color: string
  icon: ElementType
}

/**
 * Everything that differs between the Air and Sea SLA pages. SlaPage,
 * DashboardAlertCards and RouteAlertTable all read from this single source —
 * do NOT re-declare alert keys/labels/colors in components.
 */
export interface SlaMode {
  key: 'air' | 'sea'
  pageTitle: string
  tableName: string
  alerts: SlaAlertDef[]
  /** Air only: the offloaded-AWB (Flight Tracking) tab machinery. */
  hasFlightTracking: boolean
  /** normalizeSheetIdentifier(sheet_name) emitted by the sync.completed socket event. */
  syncSheetKey: string
  syncNote: string
  defaultVisibleColumns: Set<string>
  frozenKeys: Array<{ key: string; width: number }>
}

export const AIR_SLA_MODE: SlaMode = {
  key: 'air',
  pageTitle: 'SLA Monitoring — Air',
  tableName: 'air_shipments_compileaircgk',
  alerts: [
    { key: 'reservasiPenerbangan', label: 'Flight Reservations', shortLabel: 'Flight Res.', color: GOOD, icon: Clock },
    { key: 'flightTracking', label: 'Flight Tracking', shortLabel: 'Flight Track.', color: BRAND_ALT, icon: Plane },
    { key: 'potensiMelebihiSla', label: 'Potential SLA Breach', shortLabel: 'Pot. SLA', color: WARN, icon: Hourglass },
    { key: 'melewatiSla', label: 'SLA Breach', shortLabel: 'SLA Breach', color: BAD, icon: AlertTriangle },
    { key: 'potensiMelebihiTjph', label: 'Potential TJPH Breach', shortLabel: 'Pot. TJPH', color: WARN_TJPH, icon: PlaneLanding },
    { key: 'melewatiTjph', label: 'TJPH Breach', shortLabel: 'TJPH Breach', color: BAD_TJPH, icon: ShieldAlert },
    { key: 'spxTjphAlert', label: 'SPX TJPH Alert', shortLabel: 'SPX TJPH', color: DARK, icon: Timer },
    { key: 'spxSlaAlert', label: 'SPX SLA Alert', shortLabel: 'SPX SLA', color: BRAND_DARK, icon: ShieldAlert },
  ],
  hasFlightTracking: true,
  syncSheetKey: 'compileaircgk',
  syncNote: 'Live refresh is active for Compile Air CGK synchronization.',
  defaultVisibleColumns: SLA_DEFAULT_VISIBLE,
  frozenKeys: SLA_FROZEN_KEYS,
}

/** Order follows the product request: reservation, SLA pair, TJPH pair, SPX SLA, SPX TJPH. */
export const SEA_SLA_MODE: SlaMode = {
  key: 'sea',
  pageTitle: 'SLA Monitoring — Sea',
  tableName: 'air_shipments_compileseanonjava',
  alerts: [
    { key: 'reservasiKapal', label: 'Sea Reservation', shortLabel: 'Sea Res.', color: GOOD, icon: Ship },
    { key: 'potensiMelebihiSla', label: 'Potential SLA Breach', shortLabel: 'Pot. SLA', color: WARN, icon: Hourglass },
    { key: 'melewatiSla', label: 'SLA Breach', shortLabel: 'SLA Breach', color: BAD, icon: AlertTriangle },
    { key: 'potensiMelebihiTjph', label: 'Potential TJPH Breach', shortLabel: 'Pot. TJPH', color: WARN_TJPH, icon: Anchor },
    { key: 'melewatiTjph', label: 'TJPH Breach', shortLabel: 'TJPH Breach', color: BAD_TJPH, icon: ShieldAlert },
    { key: 'spxSlaAlert', label: 'SPX SLA Alert', shortLabel: 'SPX SLA', color: BRAND_DARK, icon: ShieldAlert },
    { key: 'spxTjphAlert', label: 'SPX TJPH Alert', shortLabel: 'SPX TJPH', color: DARK, icon: Timer },
  ],
  hasFlightTracking: false,
  syncSheetKey: 'compileseanonjava',
  syncNote: 'Live refresh is active for Compile Sea Non Java synchronization.',
  defaultVisibleColumns: new Set([
    'date',
    'lt_number',
    'to_number',
    'origin',
    'destination',
    'actual_ship_name',
    'atd_origin',
    'atd_sailing',
    'ata_sailing',
    'trip_completed',
    'ata_vendor_wh_destination_sertakan_link_evidence',
    'sla',
    'tjph',
    'issue',
    'remarks',
  ]),
  frozenKeys: SLA_FROZEN_KEYS,
}
