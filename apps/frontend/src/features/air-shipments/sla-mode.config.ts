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
    { key: 'reservasiPenerbangan', label: 'Flight Reservations', shortLabel: 'Flight Res.', color: '#F97316', icon: Clock },
    { key: 'flightTracking', label: 'Flight Tracking', shortLabel: 'Flight Track.', color: '#3B82F6', icon: Plane },
    { key: 'potensiMelebihiSla', label: 'Potential SLA Breach', shortLabel: 'Pot. SLA', color: '#EAB308', icon: Hourglass },
    { key: 'melewatiSla', label: 'SLA Breach', shortLabel: 'SLA Breach', color: '#EF4444', icon: AlertTriangle },
    { key: 'potensiMelebihiTjph', label: 'Potential TJPH Breach', shortLabel: 'Pot. TJPH', color: '#8B5CF6', icon: PlaneLanding },
    { key: 'melewatiTjph', label: 'TJPH Breach', shortLabel: 'TJPH Breach', color: '#DC2626', icon: ShieldAlert },
    { key: 'spxTjphAlert', label: 'SPX TJPH Alert', shortLabel: 'SPX TJPH', color: '#0D9488', icon: Timer },
    { key: 'spxSlaAlert', label: 'SPX SLA Alert', shortLabel: 'SPX SLA', color: '#0891B2', icon: ShieldAlert },
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
    { key: 'reservasiKapal', label: 'Sea Reservation', shortLabel: 'Sea Res.', color: '#F97316', icon: Ship },
    { key: 'potensiMelebihiSla', label: 'Potential SLA Breach', shortLabel: 'Pot. SLA', color: '#EAB308', icon: Hourglass },
    { key: 'melewatiSla', label: 'SLA Breach', shortLabel: 'SLA Breach', color: '#EF4444', icon: AlertTriangle },
    { key: 'potensiMelebihiTjph', label: 'Potential TJPH Breach', shortLabel: 'Pot. TJPH', color: '#8B5CF6', icon: Anchor },
    { key: 'melewatiTjph', label: 'TJPH Breach', shortLabel: 'TJPH Breach', color: '#DC2626', icon: ShieldAlert },
    { key: 'spxSlaAlert', label: 'SPX SLA Alert', shortLabel: 'SPX SLA', color: '#0891B2', icon: ShieldAlert },
    { key: 'spxTjphAlert', label: 'SPX TJPH Alert', shortLabel: 'SPX TJPH', color: '#0D9488', icon: Timer },
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
