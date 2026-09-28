import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
import { FleetDriverEntity } from '../fleet-drivers/entities/fleet-driver.entity'
import { daysUntil, severityFor, todayISO } from './fleet-severity'
import { FleetAlertView } from './fleet-vehicles.types'

export const DEFAULT_ALERT_LIMIT = 50
export const MAX_ALERT_LIMIT = 200

interface DocRow {
  vehicleId: string
  nopol: string
  merk: string | null
  tipe: string | null
  pool: string | null
  driverName: string | null
  docTypeId: string
  label: string
  expiresAt: string | Date
  warnDays: number | null
}

interface SimRow {
  driverId: string
  driverName: string
  vehicleId: string | null
  nopol: string | null
  merk: string | null
  tipe: string | null
  pool: string | null
  label: string
  expiresAt: string | Date
  warnDays: number | null
}

// Two queries and one merge, rather than a walk over the vehicle list: this endpoint must not
// grow a query per unit as the register does.
@Injectable()
export class FleetAlertsService {
  constructor(
    @InjectRepository(FleetVehicleDocumentEntity)
    private readonly docRepo: Repository<FleetVehicleDocumentEntity>,
    @InjectRepository(FleetDriverEntity)
    private readonly driverRepo: Repository<FleetDriverEntity>,
  ) {}

  // `today` is a parameter so the tests can fix it; callers use the default. One value for the
  // whole list, so two rows in the same response can never be measured against different days.
  async list(
    limit: number = DEFAULT_ALERT_LIMIT,
    today: string = todayISO(),
  ): Promise<FleetAlertView[]> {
    const [docs, sims] = await Promise.all([this.documentRows(), this.simRows()])

    const alerts: FleetAlertView[] = []

    for (const row of docs) {
      const alert = this.toAlert(row, today)
      if (alert) alerts.push(alert)
    }
    for (const row of sims) {
      const alert = this.toSimAlert(row, today)
      if (alert) alerts.push(alert)
    }

    // Sorted after merging rather than in SQL, because the two sources are ordered against each
    // other and only the merged list has the answer. Most urgent first: an expired paper must
    // never sit below one merely due soon.
    alerts.sort((a, b) => a.daysLeft - b.daysLeft || (a.nopol ?? '').localeCompare(b.nopol ?? ''))
    return alerts.slice(0, limit)
  }

  private async documentRows(): Promise<DocRow[]> {
    return (await this.docRepo
      .createQueryBuilder('d')
      .select('d.vehicle_id', 'vehicleId')
      .addSelect('v.nopol', 'nopol')
      .addSelect('v.merk', 'merk')
      .addSelect('v.tipe', 'tipe')
      .addSelect('p.label', 'pool')
      .addSelect('dr.nama', 'driverName')
      .addSelect('d.doc_type_id', 'docTypeId')
      .addSelect('dt.label', 'label')
      .addSelect('d.expires_at', 'expiresAt')
      .addSelect('dt.warn_days', 'warnDays')
      .innerJoin('d.vehicle', 'v')
      .innerJoin('d.docType', 'dt')
      .leftJoin('v.pool', 'p')
      .leftJoin('v.driver', 'dr')
      .where('d.isCurrent = TRUE')
      .andWhere('d.expiresAt IS NOT NULL')
      // Archived units are out of the register: alerting on one would send an operator to renew
      // the papers of a truck that has been sold.
      .andWhere('v.isActive = TRUE')
      .getRawMany()) as DocRow[]
  }

  private async simRows(): Promise<SimRow[]> {
    return (await this.driverRepo
      .createQueryBuilder('dr')
      .select('dr.id', 'driverId')
      .addSelect('dr.nama', 'driverName')
      .addSelect('v.id', 'vehicleId')
      .addSelect('v.nopol', 'nopol')
      .addSelect('v.merk', 'merk')
      .addSelect('v.tipe', 'tipe')
      .addSelect('p.label', 'pool')
      .addSelect('sj.label', 'label')
      .addSelect('dr.sim_expires_at', 'expiresAt')
      // The threshold comes from THIS driver's jenis_sim row, not a constant: spec §2.8 puts the
      // policy in master data so an admin can change it without a deploy.
      .addSelect('sj.warn_days', 'warnDays')
      .innerJoin('dr.simJenis', 'sj')
      .leftJoin('fleet_vehicles', 'v', 'v.driver_id = dr.id AND v.is_active = TRUE')
      .leftJoin('v.pool', 'p')
      .where('dr.simExpiresAt IS NOT NULL')
      .andWhere('dr.isActive = TRUE')
      .getRawMany()) as SimRow[]
  }

  private toAlert(row: DocRow, today: string): FleetAlertView | null {
    const expiresAt = this.toISO(row.expiresAt)
    const daysLeft = daysUntil(expiresAt, today)
    if (daysLeft === null) return null

    const severity = severityFor(daysLeft, row.warnDays)
    // 'ok' is not an alert. Filtering on severity rather than on a day count is what keeps this
    // list agreeing with the badge each row carries in the table below.
    if (severity === 'ok' || severity === 'none') return null

    return {
      kind: 'document',
      vehicleId: row.vehicleId,
      nopol: row.nopol,
      merk: row.merk,
      tipe: row.tipe,
      pool: row.pool,
      subjectId: row.docTypeId,
      label: row.label,
      expiresAt: expiresAt as string,
      daysLeft,
      severity,
      driverName: row.driverName,
    }
  }

  private toSimAlert(row: SimRow, today: string): FleetAlertView | null {
    const expiresAt = this.toISO(row.expiresAt)
    const daysLeft = daysUntil(expiresAt, today)
    if (daysLeft === null) return null

    const severity = severityFor(daysLeft, row.warnDays)
    if (severity === 'ok' || severity === 'none') return null

    return {
      kind: 'sim',
      vehicleId: row.vehicleId,
      nopol: row.nopol,
      merk: row.merk,
      tipe: row.tipe,
      pool: row.pool,
      subjectId: row.driverId,
      label: row.label,
      expiresAt: expiresAt as string,
      daysLeft,
      severity,
      driverName: row.driverName,
    }
  }

  // A date column surfaces as 'YYYY-MM-DD' or as a Date depending on the driver's parser, and a
  // Date is read off its LOCAL fields — toISOString() would report the previous day everywhere
  // east of Greenwich, which under Asia/Jakarta is every row.
  private toISO(value: string | Date | null): string | null {
    if (value == null) return null
    if (value instanceof Date) {
      const month = String(value.getMonth() + 1).padStart(2, '0')
      const day = String(value.getDate()).padStart(2, '0')
      return `${value.getFullYear()}-${month}-${day}`
    }
    return value.slice(0, 10)
  }
}
