import { LinehaulParserService } from './linehaul-parser.service';

// -----------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------

// Mock pdf2json with configurable output per test
let mockPdfData: unknown = { Pages: [] };
let mockShouldFail = false;

jest.mock('pdf2json', () => {
  return jest.fn().mockImplementation(() => ({
    on(event: string, cb: (...args: unknown[]) => void) {
      if (event === 'pdfParser_dataReady' && !mockShouldFail) {
        setTimeout(() => cb(mockPdfData), 0);
      }
      if (event === 'pdfParser_dataError' && mockShouldFail) {
        setTimeout(() => cb({ parserError: 'corrupt PDF' }), 0);
      }
    },
    parseBuffer: jest.fn(),
  }));
});

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function makeTextItem(x: number, y: number, text: string) {
  return { x, y, R: [{ T: encodeURIComponent(text) }] };
}

function makePdfData(items: ReturnType<typeof makeTextItem>[]) {
  return { Pages: [{ Texts: items }] };
}

function makeFullLinehaulPdf() {
  // Header section (y < 10)
  const header = [
    makeTextItem(2, 1, 'Surat Jalan'),
    makeTextItem(2, 2, 'LT2026031901'),
    makeTextItem(2, 3, 'Schedule'),
    makeTextItem(20, 3, 'SCH-001'),
    makeTextItem(2, 4, 'Origin'),
    makeTextItem(20, 4, 'Jakarta'),
    makeTextItem(2, 5, 'Destination'),
    makeTextItem(20, 5, 'Bandung'),
    makeTextItem(2, 6, 'Vendor'),
    makeTextItem(20, 6, 'PT Vendor Logistics'),
    makeTextItem(2, 7, 'Driver'),
    makeTextItem(20, 7, 'Ahmad Bayu'),
    makeTextItem(40, 2, 'B1234XYZ'),
    makeTextItem(2, 8, 'STD'),
    makeTextItem(20, 8, '2026-03-19T08:00:00'),
    makeTextItem(2, 9, 'STA'),
    makeTextItem(20, 9, '2026-03-19T14:00:00'),
  ];

  // Table header (y = 10)
  const tableHeader = [
    makeTextItem(2, 10, 'Nomor TO'),
    makeTextItem(20, 10, 'Weight'),
    makeTextItem(35, 10, 'Destination'),
    makeTextItem(50, 10, 'DG Type'),
    makeTextItem(65, 10, 'TO Type'),
  ];

  // Table rows
  const row1 = [
    makeTextItem(2, 12, 'TO-2026031900001'),
    makeTextItem(20, 12, '12.5'),
    makeTextItem(35, 12, 'Bandung'),
    makeTextItem(50, 12, 'non-dg'),
    makeTextItem(65, 12, 'REGULAR'),
  ];
  const row2 = [
    makeTextItem(2, 14, 'TO-2026031900002'),
    makeTextItem(20, 14, '8.0'),
    makeTextItem(35, 14, 'Surabaya'),
    makeTextItem(50, 14, ''),
    makeTextItem(65, 14, 'EXPRESS'),
  ];

  return makePdfData([...header, ...tableHeader, ...row1, ...row2]);
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('LinehaulParserService (unit)', () => {
  let service: LinehaulParserService;

  beforeEach(() => {
    service = new LinehaulParserService();
    mockShouldFail = false;
    mockPdfData = { Pages: [] };
  });

  describe('parse() — header field extraction', () => {
    it('extracts trip_code from positional data', async () => {
      mockPdfData = makeFullLinehaulPdf();
      const result = await service.parse(Buffer.from('test'));
      expect(result.trip.tripCode).toBe('LT2026031901');
    });

    it('extracts schedule via keyword proximity', async () => {
      mockPdfData = makeFullLinehaulPdf();
      const result = await service.parse(Buffer.from('test'));
      expect(result.trip.schedule).toBe('SCH-001');
    });

    it('extracts origin and destination', async () => {
      mockPdfData = makeFullLinehaulPdf();
      const result = await service.parse(Buffer.from('test'));
      expect(result.trip.origin).toBe('Jakarta');
      expect(result.trip.destination).toBe('Bandung');
    });

    it('extracts vendor and driver_name', async () => {
      mockPdfData = makeFullLinehaulPdf();
      const result = await service.parse(Buffer.from('test'));
      expect(result.trip.vendor).toBe('PT Vendor Logistics');
      expect(result.trip.driverName).toBe('Ahmad Bayu');
    });

    it('extracts plate_number via regex', async () => {
      mockPdfData = makeFullLinehaulPdf();
      const result = await service.parse(Buffer.from('test'));
      expect(result.trip.plateNumber).toBe('B1234XYZ');
    });

    it('extracts STD/STA datetime fields', async () => {
      mockPdfData = makeFullLinehaulPdf();
      const result = await service.parse(Buffer.from('test'));
      expect(result.trip.std).toBeTruthy();
      expect(result.trip.sta).toBeTruthy();
    });
  });

  describe('parse() — table row reconstruction', () => {
    it('reconstructs rows via x-coordinate clustering', async () => {
      mockPdfData = makeFullLinehaulPdf();
      const result = await service.parse(Buffer.from('test'));
      expect(result.items).toHaveLength(2);
    });

    it('maps table columns to correct fields', async () => {
      mockPdfData = makeFullLinehaulPdf();
      const result = await service.parse(Buffer.from('test'));
      expect(result.items[0].toNumber).toBe('TO-2026031900001');
      expect(result.items[0].weight).toBe(12.5);
      expect(result.items[0].destination).toBe('Bandung');
      expect(result.items[0].dgType).toBe('non-dg');
      expect(result.items[0].toType).toBe('REGULAR');
    });

    it('handles missing optional fields in rows', async () => {
      mockPdfData = makeFullLinehaulPdf();
      const result = await service.parse(Buffer.from('test'));
      // row2 has empty dgType
      expect(result.items[1].toNumber).toBe('TO-2026031900002');
      expect(result.items[1].weight).toBe(8.0);
    });
  });

  describe('parse() — multi-line cell merge', () => {
    it('merges text blocks at close y coordinates within same column', async () => {
      mockPdfData = makePdfData([
        makeTextItem(2, 1, 'Surat Jalan'),
        makeTextItem(2, 2, 'LT2026031901'),
        makeTextItem(2, 3, 'Origin'),
        makeTextItem(20, 3, 'Jakarta'),
        makeTextItem(2, 4, 'Destination'),
        makeTextItem(20, 4, 'Bandung'),
        // Table
        makeTextItem(2, 10, 'Nomor TO'),
        makeTextItem(20, 10, 'Weight'),
        // Multi-line TO number (close y values)
        makeTextItem(2, 12, 'TO-2026'),
        makeTextItem(2, 13, '031900001'),
        makeTextItem(20, 12, '15.0'),
      ]);
      const result = await service.parse(Buffer.from('test'));
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      // First item's toNumber should contain both parts
      expect(result.items[0].toNumber).toContain('TO-2026');
    });
  });

  describe('parse() — fallback to regex', () => {
    it('falls back to regex when positional data is degenerate', async () => {
      // All items at same x — clustering yields 1 column → degenerate
      mockPdfData = makePdfData([
        makeTextItem(5, 1, 'Surat Jalan'),
        makeTextItem(5, 2, 'LT2026031901'),
        makeTextItem(5, 3, 'Origin: Jakarta'),
        makeTextItem(5, 4, 'Destination: Bandung'),
        makeTextItem(5, 10, 'Nomor TO'),
        makeTextItem(5, 12, 'TO-2026031900001'),
        makeTextItem(5, 14, 'TO-2026031900002'),
      ]);
      const result = await service.parse(Buffer.from('test'));
      expect(result.trip.tripCode).toBe('LT2026031901');
      // Regex fallback should find TO numbers
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('parse() — error handling', () => {
    it('throws on empty/corrupt PDF', async () => {
      mockShouldFail = true;
      await expect(service.parse(Buffer.from('corrupt'))).rejects.toThrow();
    });

    it('throws when PDF has no text', async () => {
      mockPdfData = { Pages: [{ Texts: [] }] };
      await expect(service.parse(Buffer.from('empty'))).rejects.toThrow('no extractable text');
    });
  });
});
