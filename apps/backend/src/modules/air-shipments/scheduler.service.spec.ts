import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { AirShipmentsService } from './air-shipments.service';

const makeAirShipmentsService = () => ({
  runSyncCycle: jest.fn().mockResolvedValue({ affectedTables: [], totalUpserted: 0 }),
});

const makeSchedulerRegistry = () => ({
  doesExist: jest.fn().mockReturnValue(true),
  deleteInterval: jest.fn(),
  addInterval: jest.fn(),
});

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
      ],
    }).compile();

    scheduler = module.get<SchedulerService>(SchedulerService);
  });

  it('skips a tick when isSyncing is already true', async () => {
    // Simulate a long-running sync
    (scheduler as any).isSyncing = true;
    await scheduler.tick();
    expect(airShipmentsService.runSyncCycle).not.toHaveBeenCalled();
  });

  it('increments consecutiveSkips and pauses after 2 skips', async () => {
    (scheduler as any).isSyncing = true;
    await scheduler.tick();
    await scheduler.tick();
    expect((scheduler as any).consecutiveSkips).toBe(2);
    expect(schedulerRegistry.deleteInterval).toHaveBeenCalled();
  });

  it('runs the sync cycle when not already syncing', async () => {
    (scheduler as any).isSyncing = false;
    await scheduler.tick();
    expect(airShipmentsService.runSyncCycle).toHaveBeenCalled();
  });

  it('resets isSyncing and consecutiveSkips after cycle completes', async () => {
    (scheduler as any).isSyncing = false;
    await scheduler.tick();
    expect((scheduler as any).isSyncing).toBe(false);
    expect((scheduler as any).consecutiveSkips).toBe(0);
  });

  it('onApplicationShutdown deletes the interval', () => {
    scheduler.onApplicationShutdown();
    expect(schedulerRegistry.deleteInterval).toHaveBeenCalled();
  });
});
