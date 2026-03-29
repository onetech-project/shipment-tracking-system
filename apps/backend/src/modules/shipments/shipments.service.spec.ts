import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { Shipment } from './entities/shipment.entity';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const SHIPMENT = {
  id: 'f0000000-0000-4000-8000-000000000001',
  organizationId: ORG_ID,
  shipmentId: 'SHP-001',
  origin: 'Jakarta',
  destination: 'Bandung',
  status: 'in_transit',
  carrier: 'JNE',
  estimatedDeliveryDate: null,
  contentsDescription: null,
  lastImportUploadId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Shipment;

const mockShipmentRepo = {
  findOne: jest.fn(),
};

const mockConfig = {
  get: (key: string, defaultVal?: string) => {
    if (key === 'SHIPMENT_ID_REGEX') return '^[A-Z0-9-]{6,40}$';
    return defaultVal;
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShipmentsService (unit)', () => {
  let service: ShipmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ShipmentsService,
        { provide: getRepositoryToken(Shipment), useValue: mockShipmentRepo },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(ShipmentsService);
  });

  it('returns a shipment when found', async () => {
    mockShipmentRepo.findOne.mockResolvedValue(SHIPMENT);
    const result = await service.findByShipmentId(ORG_ID, 'SHP-001');
    expect(result).toMatchObject({ shipmentId: 'SHP-001', origin: 'Jakarta' });
  });

  it('throws NotFoundException when shipment does not exist', async () => {
    mockShipmentRepo.findOne.mockResolvedValue(null);
    await expect(service.findByShipmentId(ORG_ID, 'SHP-999')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException for malformed shipment ID', async () => {
    await expect(service.findByShipmentId(ORG_ID, '!! bad !!')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for empty shipment ID', async () => {
    await expect(service.findByShipmentId(ORG_ID, '')).rejects.toThrow(BadRequestException);
  });

  it('accepts valid format IDs (uppercase alphanumeric + dash)', async () => {
    mockShipmentRepo.findOne.mockResolvedValue(SHIPMENT);
    await expect(service.findByShipmentId(ORG_ID, 'SHP-001')).resolves.not.toThrow();
    await expect(service.findByShipmentId(ORG_ID, 'ABC123')).resolves.not.toThrow();
  });

  it('scopes lookup to the provided organizationId', async () => {
    mockShipmentRepo.findOne.mockResolvedValue(SHIPMENT);
    await service.findByShipmentId(ORG_ID, 'SHP-001');
    expect(mockShipmentRepo.findOne).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID, shipmentId: 'SHP-001' },
    });
  });
});
