import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SheetsService } from './sheets.service';
import { SyncNotificationGateway } from './sync-notification.gateway';
import { AirShipmentCgk } from './entities/air-shipment-cgk.entity';
import { AirShipmentSub } from './entities/air-shipment-sub.entity';
import { AirShipmentSda } from './entities/air-shipment-sda.entity';
import { RatePerStation } from './entities/rate-per-station.entity';
import { RouteMaster } from './entities/route-master.entity';

/** System-managed columns that are never diff-compared against sheet data */
const SYSTEM_COLUMNS = new Set(['id', 'is_locked', 'last_synced_at', 'created_at', 'updated_at']);

@Injectable()
export class AirShipmentsService {
  private readonly logger = new Logger(AirShipmentsService.name);
  private readonly repoMap: Map<string, Repository<any>>;

  constructor(
    private readonly sheetsService: SheetsService,
    @Optional() private readonly gateway: SyncNotificationGateway | null,
    @InjectRepository(AirShipmentCgk) private readonly cgkRepo: Repository<AirShipmentCgk>,
    @InjectRepository(AirShipmentSub) private readonly subRepo: Repository<AirShipmentSub>,
    @InjectRepository(AirShipmentSda) private readonly sdaRepo: Repository<AirShipmentSda>,
    @InjectRepository(RatePerStation) private readonly rateRepo: Repository<RatePerStation>,
    @InjectRepository(RouteMaster) private readonly routeRepo: Repository<RouteMaster>,
  ) {
    this.repoMap = new Map<string, Repository<any>>([
      ['air_shipments_cgk', this.cgkRepo],
      ['air_shipments_sub', this.subRepo],
      ['air_shipments_sda', this.sdaRepo],
      ['rate_per_station', this.rateRepo],
      ['route_master', this.routeRepo],
    ]);
  }

  /** Returns the TypeORM Repository for a given table name. */
  private repoFor(tableName: string): Repository<any> {
    const repo = this.repoMap.get(tableName);
    if (!repo) throw new Error(`No repository registered for table "${tableName}"`);
    return repo;
  }

  /**
   * Executes a full sync cycle:
   * 1. Fetch all sheets via SheetsService
   * 2. For each sheet, diff incoming rows against DB
   * 3. Upsert changed/new rows; skip locked rows and unchanged rows
   *
   * FR-028–FR-046
   */
  async runSyncCycle(): Promise<{ affectedTables: string[]; totalUpserted: number }> {
    const startedAt = Date.now();
    const configs = this.sheetsService.getConfigs();
    const results = await this.sheetsService.fetchAllSheets(configs);

    let totalUpserted = 0;
    const affectedTables: string[] = [];

    for (const sheet of results) {
      const { tableName, uniqueKey, headers, rows } = sheet;

      if (rows.length === 0) continue;

      // Normalise uniqueKey to array for uniform handling (supports composite keys)
      const keyColumns = Array.isArray(uniqueKey) ? uniqueKey : [uniqueKey];

      // Build a stable string composite key from a row object
      const rowKey = (row: Record<string, unknown>): string =>
        keyColumns.map((k) => String(row[k] ?? '')).join('\x00');

      // Validate that all uniqueKey columns are present in normalized headers (FR-028)
      const missingKeys = keyColumns.filter((k) => !headers.includes(k));
      if (missingKeys.length > 0) {
        this.logger.warn(
          `[sync] Sheet "${sheet.sheetName}" is missing uniqueKey column(s) "${missingKeys.join(', ')}" — skipping`,
        );
        continue;
      }

      const repo = this.repoFor(tableName);

      // Bulk-fetch all existing rows to build an in-memory lookup map (FR-030)
      const existingRows = await repo.find();
      const existingMap = new Map<string, Record<string, unknown>>();
      for (const row of existingRows) {
        const existing = row as Record<string, unknown>;
        existingMap.set(rowKey(existing), existing);
      }

      let sheetUpserted = 0;

      for (const incomingRow of rows) {
        // Skip locked rows regardless of changes (FR-029)
        if (incomingRow['is_locked'] === true) continue;

        const keyValue = rowKey(incomingRow);
        const existingRow = existingMap.get(keyValue);

        if (existingRow) {
          // Diff check — only upsert if at least one non-system field changed (FR-031)
          const hasChanges = Object.keys(incomingRow).some(
            (k) => !SYSTEM_COLUMNS.has(k) && String(incomingRow[k]) !== String(existingRow[k]),
          );
          if (!hasChanges) continue;

          await repo.save({ ...existingRow, ...incomingRow, last_synced_at: new Date() });
        } else {
          await repo.save({ ...incomingRow, last_synced_at: new Date() });
        }

        sheetUpserted++;
      }

      if (sheetUpserted > 0) {
        this.logger.log(`[sync] ${tableName}: ${sheetUpserted} row(s) upserted`);
        affectedTables.push(tableName);
        totalUpserted += sheetUpserted;
      }
    }

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `[sync] Cycle complete in ${durationMs}ms — ${totalUpserted} row(s) upserted across ${affectedTables.length} table(s)`,
    );

    // Notify connected WebSocket clients — only when there were changes (FR-032)
    if (totalUpserted > 0 && this.gateway) {
      this.gateway.notifyClients({
        affectedTables,
        totalUpserted,
        syncedAt: new Date().toISOString(),
      });
    }

    return { affectedTables, totalUpserted };
  }

  // ──────────────────────────────────────────────────
  // US3 — Paginated REST query methods (FR-035–FR-037)
  // ──────────────────────────────────────────────────


  private async paginatedQuery<T extends object>(
    repo: Repository<T>,
    {
      page,
      limit,
      sortBy,
      sortOrder,
      search,
    }: {
      page: number;
      limit: number;
      sortBy: string;
      sortOrder: 'asc' | 'desc';
      search?: string;
    },
    tableName?: string,
  ) {
    // Guard against sorting by a column that doesn't exist on this entity (avoids DB 500)
    const columns = repo.metadata.columns.map((c) => c.propertyName);
    const safeSortBy = columns.includes(sortBy) ? sortBy : 'id';

    // Searchable fields for air shipments tables
    const SEARCHABLE_FIELDS = [
      'to_number',
      'lt_number',
      'flight_no',
      'nopol_pickup',
      'driver_name_pickup',
      'actual_airline_name',
    ];

    let where: any = undefined;
    if (search && typeof search === 'string' && search.trim() &&
      ['air_shipments_cgk', 'air_shipments_sub', 'air_shipments_sda'].includes(tableName || '')) {
      // Use ILike for case-insensitive partial match
      const { ILike } = require('typeorm');
      where = SEARCHABLE_FIELDS.map((field) => ({ [field]: ILike(`%${search}%`) }));
    }

    const [data, total] = await repo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { [safeSortBy]: sortOrder.toUpperCase() } as any,
      ...(where ? { where } : {}),
    });
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }


    findAllCgk(query: { page: number; limit: number; sortBy: string; sortOrder: 'asc' | 'desc'; search?: string }) {
      return this.paginatedQuery(this.cgkRepo, query, 'air_shipments_cgk');
    }

    findAllSub(query: { page: number; limit: number; sortBy: string; sortOrder: 'asc' | 'desc'; search?: string }) {
      return this.paginatedQuery(this.subRepo, query, 'air_shipments_sub');
    }

    findAllSda(query: { page: number; limit: number; sortBy: string; sortOrder: 'asc' | 'desc'; search?: string }) {
      return this.paginatedQuery(this.sdaRepo, query, 'air_shipments_sda');
    }

  findAllRate(query: { page: number; limit: number; sortBy: string; sortOrder: 'asc' | 'desc' }) {
    return this.paginatedQuery(this.rateRepo, query);
  }

  findAllRoutes(query: { page: number; limit: number; sortBy: string; sortOrder: 'asc' | 'desc' }) {
    return this.paginatedQuery(this.routeRepo, query);
  }
}
