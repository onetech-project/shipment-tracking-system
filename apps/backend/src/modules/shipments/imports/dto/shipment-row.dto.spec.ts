import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ShipmentRowDto } from './shipment-row.dto';
import { ResolveConflictDto, ConflictDecisionDto } from './resolve-conflict.dto';

// ---------------------------------------------------------------------------
// ShipmentRowDto
// ---------------------------------------------------------------------------

describe('ShipmentRowDto (unit)', () => {
  function dto(override: Partial<Record<string, unknown>> = {}) {
    return plainToInstance(ShipmentRowDto, {
      shipmentId: 'SHP-001',
      origin: 'Jakarta',
      destination: 'Bandung',
      status: 'pending',
      ...override,
    });
  }

  it('passes a fully valid row', async () => {
    const errors = await validate(dto());
    expect(errors).toHaveLength(0);
  });

  it('passes with optional fields present', async () => {
    const errors = await validate(
      dto({ carrier: 'JNE', estimatedDeliveryDate: '2026-04-01', contentsDescription: 'Goods' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('fails when shipmentId is missing', async () => {
    const errors = await validate(dto({ shipmentId: undefined }));
    expect(errors.some((e) => e.property === 'shipmentId')).toBe(true);
  });

  it('fails when shipmentId is empty string', async () => {
    const errors = await validate(dto({ shipmentId: '' }));
    expect(errors.some((e) => e.property === 'shipmentId')).toBe(true);
  });

  it('fails when origin is missing', async () => {
    const errors = await validate(dto({ origin: undefined }));
    expect(errors.some((e) => e.property === 'origin')).toBe(true);
  });

  it('fails when destination is missing', async () => {
    const errors = await validate(dto({ destination: undefined }));
    expect(errors.some((e) => e.property === 'destination')).toBe(true);
  });

  it('fails when status is missing', async () => {
    const errors = await validate(dto({ status: undefined }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('allows null for optional carrier', async () => {
    const errors = await validate(dto({ carrier: null }));
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ResolveConflictDto
// ---------------------------------------------------------------------------

describe('ResolveConflictDto (unit)', () => {
  function dto(decisions: unknown[]) {
    return plainToInstance(ResolveConflictDto, { decisions });
  }

  it('passes with overwrite decision', async () => {
    const errors = await validate(
      dto([{ errorId: 'a0000000-0000-4000-8000-000000000001', action: 'overwrite' }]),
    );
    expect(errors).toHaveLength(0);
  });

  it('passes with skip decision', async () => {
    const errors = await validate(
      dto([{ errorId: 'a0000000-0000-4000-8000-000000000001', action: 'skip' }]),
    );
    expect(errors).toHaveLength(0);
  });

  it('fails with invalid action value', async () => {
    const errors = await validate(
      dto([{ errorId: 'a0000000-0000-4000-8000-000000000001', action: 'delete' }]),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails with missing errorId', async () => {
    const errors = await validate(dto([{ action: 'overwrite' }]));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails with empty decisions array', async () => {
    const errors = await validate(dto([]));
    expect(errors.some((e) => e.property === 'decisions')).toBe(true);
  });
});
