import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { AirShipmentsService } from './air-shipments.service';
import { DynamicTableService } from './dynamic-table.service';

const SHEET_ID = 'sheet-1';

const makeAirShipmentsService = () => ({
  runSyncCycle: jest.fn().mockResolvedValue({ affectedTables: [], totalUpserted: 0 }),
});

const makeSchedulerRegistry = () => ({
  doesExist: jest.fn().mockReturnValue(true),
  deleteInterval: jest.fn(),
  addInterval: jest.fn(),
});

const makeDynamicTableService = () => ({
  ensureTable: jest.fn().mockResolvedValue(undefined),
});

const initState = (
  scheduler: SchedulerService,
  opts: { isSyncing: boolean; consecutiveSkips?: number; isPaused?: boolean },
) => {
  (scheduler as any).state.set(SHEET_ID, {
    isSyncing: opts.isSyncing,
    consecutiveSkips: opts.consecutiveSkips ?? 0,
    isPaused: opts.isPaused ?? false,
  });
};

describe('SchedulerService', () => {
  let scheduler: SchedulerService;
  let airShipmentsService: ReturnType<typeof makeAirShipmentsService>;
  let schedulerRegistry: ReturnType<typeof makeSchedulerRegistry>;

  beforeEach(async () => {
    airShipmentsService = makeAirShipmentsService();
    schedulerRegistry = makeSchedulerRegistry();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: AirShipmentsService, useValue: airShipmentsService },
        { provide: SchedulerRegistry, useValue: schedulerRegistry },
        { provide: DynamicTableService, useValue: makeDynamicTableService() },
      ],
    }).compile();

    scheduler = module.get<SchedulerService>(SchedulerService);
  });

  it('skips a tick when isSyncing is already true', async () => {
    initState(scheduler, { isSyncing: true });
    await scheduler.tick(SHEET_ID);
    expect(airShipmentsService.runSyncCycle).not.toHaveBeenCalled();
  });

  it('increments consecutiveSkips and pauses after 2 skips', async () => {
    initState(scheduler, { isSyncing: true });
    await scheduler.tick(SHEET_ID);
    await scheduler.tick(SHEET_ID);
    const state = (scheduler as any).state.get(SHEET_ID);
    expect(state.consecutiveSkips).toBe(2);
    expect(schedulerRegistry.deleteInterval).toHaveBeenCalled();
  });

  it('runs the sync cycle when not already syncing', async () => {
    initState(scheduler, { isSyncing: false });
    await scheduler.tick(SHEET_ID);
    expect(airShipmentsService.runSyncCycle).toHaveBeenCalled();
  });

  it('resets isSyncing and consecutiveSkips after cycle completes', async () => {
    initState(scheduler, { isSyncing: false });
    await scheduler.tick(SHEET_ID);
    const state = (scheduler as any).state.get(SHEET_ID);
    expect(state.isSyncing).toBe(false);
    expect(state.consecutiveSkips).toBe(0);
  });

  it('onApplicationShutdown deletes the interval', () => {
    (scheduler as any).intervals.set(SHEET_ID, 15000);
    scheduler.onApplicationShutdown();
    expect(schedulerRegistry.deleteInterval).toHaveBeenCalled();
  });
});
