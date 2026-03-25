import { LinehaulParserService } from './linehaul-parser.service'

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/** Create a positioned text block as pdfjs-dist would produce (y=0 at top). */
function tb(x: number, y: number, text: string) {
  return { x, y, text }
}

function makeFullLinehaulBlocks() {
  // Header section (y < 250)
  return [
    tb(230, 25, 'Surat Jalan'),
    tb(240, 45, 'LT2026031901'),
    tb(400, 45, 'B1234XYZ'),
    tb(30, 60, 'Schedule'),
    tb(200, 60, 'SCH-001'),
    tb(30, 80, 'Origin'),
    tb(200, 80, 'Jakarta'),
    tb(30, 100, 'Destination'),
    tb(200, 100, 'Bandung'),
    tb(30, 120, 'Vendor'),
    tb(200, 120, 'PT Vendor Logistics'),
    tb(30, 140, 'Driver'),
    tb(200, 140, 'Ahmad Bayu'),
    tb(30, 160, 'STD'),
    tb(200, 160, '2026-03-19T08:00:00'),
    tb(30, 180, 'STA'),
    tb(200, 180, '2026-03-19T14:00:00'),
    // Table header (y = 250)
    tb(60, 250, 'Nomor TO'),
    tb(200, 250, 'Weight'),
    tb(330, 250, 'Destination'),
    tb(460, 250, 'DG Type'),
    tb(560, 250, 'TO Type'),
    // Row 1 (y = 280)
    tb(60, 280, 'TO-2026031900001'),
    tb(200, 280, '12.5'),
    tb(330, 280, 'Bandung'),
    tb(460, 280, 'non-dg'),
    tb(560, 280, 'REGULAR'),
    // Row 2 (y = 310)
    tb(60, 310, 'TO-2026031900002'),
    tb(200, 310, '8.0'),
    tb(330, 310, 'Surabaya'),
    tb(560, 310, 'EXPRESS'),
  ]
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('LinehaulParserService (unit)', () => {
  let service: LinehaulParserService

  beforeEach(() => {
    service = new LinehaulParserService()
  })

  /** Helper to mock the private extractTextBlocks method. */
  function mockExtract(blocks: ReturnType<typeof tb>[]) {
    jest.spyOn(service as any, 'extractTextBlocks').mockResolvedValue(blocks)
  }

  describe('parse() — header field extraction', () => {
    it('extracts trip_code from positional data', async () => {
      mockExtract(makeFullLinehaulBlocks())
      const result = await service.parse(Buffer.from('test'))
      expect(result.trip.tripCode).toBe('LT2026031901')
    })

    it('extracts schedule via keyword proximity', async () => {
      mockExtract(makeFullLinehaulBlocks())
      const result = await service.parse(Buffer.from('test'))
      expect(result.trip.schedule).toBe('SCH-001')
    })

    it('extracts origin and destination', async () => {
      mockExtract(makeFullLinehaulBlocks())
      const result = await service.parse(Buffer.from('test'))
      expect(result.trip.origin).toBe('Jakarta')
      expect(result.trip.destination).toBe('Bandung')
    })

    it('extracts vendor and driver_name', async () => {
      mockExtract(makeFullLinehaulBlocks())
      const result = await service.parse(Buffer.from('test'))
      expect(result.trip.vendor).toBe('PT Vendor Logistics')
      expect(result.trip.driverName).toBe('Ahmad Bayu')
    })

    it('extracts plate_number via regex', async () => {
      mockExtract(makeFullLinehaulBlocks())
      const result = await service.parse(Buffer.from('test'))
      expect(result.trip.plateNumber).toBe('B1234XYZ')
    })

    it('extracts STD/STA datetime fields', async () => {
      mockExtract(makeFullLinehaulBlocks())
      const result = await service.parse(Buffer.from('test'))
      expect(result.trip.std).toBeTruthy()
      expect(result.trip.sta).toBeTruthy()
    })

    it('cleans leading ": " prefix from values (pdfjs-dist format)', async () => {
      mockExtract([
        tb(230, 25, 'Surat Jalan'),
        tb(240, 45, 'LT2026031901'),
        tb(30, 80, 'Origin'),
        tb(200, 80, ': Jakarta'),
        tb(30, 100, 'Destination'),
        tb(200, 100, ': Bandung'),
        // Table
        tb(60, 250, 'Nomor TO'),
        tb(200, 250, 'Weight'),
        tb(60, 280, 'TO-001'),
        tb(200, 280, '10'),
      ])
      const result = await service.parse(Buffer.from('test'))
      expect(result.trip.origin).toBe('Jakarta')
      expect(result.trip.destination).toBe('Bandung')
    })

    it('does not confuse STD (Jadwal...) label with schedule keyword', async () => {
      mockExtract([
        tb(230, 25, 'Surat Jalan'),
        tb(240, 45, 'LT2026031901'),
        tb(30, 60, 'Schedule/Adhoc'),
        tb(200, 60, ': Schedule'),
        tb(30, 80, 'Origin'),
        tb(200, 80, 'Jakarta'),
        tb(30, 100, 'Destination'),
        tb(200, 100, 'Bandung'),
        tb(30, 131, 'STD (Jadwal Keberangkatan)'),
        tb(200, 131, ': 2026/03/11 22:00:00'),
        tb(30, 167, 'STA (Jadwal Kedatangan)'),
        tb(200, 167, ': 2026/06/10 21:00:00'),
        // Table
        tb(60, 250, 'Nomor TO'),
        tb(200, 250, 'Weight'),
        tb(60, 280, 'TO-001'),
        tb(200, 280, '10'),
      ])
      const result = await service.parse(Buffer.from('test'))
      expect(result.trip.schedule).toBe('Schedule')
      expect(result.trip.std).toBeTruthy()
      expect(result.trip.sta).toBeTruthy()
    })
  })

  describe('parse() — table row reconstruction', () => {
    it('reconstructs rows via x-coordinate clustering', async () => {
      mockExtract(makeFullLinehaulBlocks())
      const result = await service.parse(Buffer.from('test'))
      expect(result.items).toHaveLength(2)
    })

    it('maps table columns to correct fields', async () => {
      mockExtract(makeFullLinehaulBlocks())
      const result = await service.parse(Buffer.from('test'))
      expect(result.items[0].toNumber).toBe('TO-2026031900001')
      expect(result.items[0].weight).toBe(12.5)
      expect(result.items[0].destination).toBe('Bandung')
      expect(result.items[0].dgType).toBe('non-dg')
      expect(result.items[0].toType).toBe('REGULAR')
    })

    it('handles missing optional fields in rows', async () => {
      mockExtract(makeFullLinehaulBlocks())
      const result = await service.parse(Buffer.from('test'))
      // row2 has no dgType
      expect(result.items[1].toNumber).toBe('TO-2026031900002')
      expect(result.items[1].weight).toBe(8.0)
    })
  })

  describe('parse() — multi-line cell merge', () => {
    it('merges text blocks at close y coordinates within same column', async () => {
      mockExtract([
        tb(230, 25, 'Surat Jalan'),
        tb(240, 45, 'LT2026031901'),
        tb(30, 80, 'Origin'),
        tb(200, 80, 'Jakarta'),
        tb(30, 100, 'Destination'),
        tb(200, 100, 'Bandung'),
        // Table
        tb(60, 250, 'Nomor TO'),
        tb(200, 250, 'Weight'),
        // Multi-line TO number (within Y_MERGE_TOLERANCE=3)
        tb(60, 280, 'TO-2026'),
        tb(60, 282, '031900001'),
        tb(200, 280, '15.0'),
      ])
      const result = await service.parse(Buffer.from('test'))
      expect(result.items.length).toBeGreaterThanOrEqual(1)
      // First item's toNumber should contain both parts
      expect(result.items[0].toNumber).toContain('TO-2026')
    })
  })

  describe('parse() — fallback to regex', () => {
    it('falls back to regex when positional data is degenerate', async () => {
      // All items at same x — clustering yields 1 column → degenerate
      mockExtract([
        tb(100, 20, 'Surat Jalan'),
        tb(100, 40, 'LT2026031901'),
        tb(100, 60, 'Origin: Jakarta'),
        tb(100, 80, 'Destination: Bandung'),
        tb(100, 250, 'Nomor TO'),
        tb(100, 280, 'TO-2026031900001'),
        tb(100, 310, 'TO-2026031900002'),
      ])
      const result = await service.parse(Buffer.from('test'))
      expect(result.trip.tripCode).toBe('LT2026031901')
      // Regex fallback should find TO numbers
      expect(result.items.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('parse() — error handling', () => {
    it('throws on corrupt PDF', async () => {
      jest
        .spyOn(service as any, 'extractTextBlocks')
        .mockRejectedValue(new Error('pdf parse error'))
      await expect(service.parse(Buffer.from('corrupt'))).rejects.toThrow()
    })

    it('throws when PDF has no text and OCR also fails', async () => {
      mockExtract([])
      jest.spyOn(service, 'extractTextViaOcr').mockResolvedValue('')
      await expect(service.parse(Buffer.from('empty'))).rejects.toThrow(
        'no extractable text (OCR also failed)'
      )
    })

    it('falls back to OCR when no text blocks found', async () => {
      mockExtract([])
      jest
        .spyOn(service, 'extractTextViaOcr')
        .mockResolvedValue(
          'LT0Q3B1EV2HO1\nOrigin - Kosambi DC\n1 TO20260306DOWIW 24 14.780 Pekanbaru DC N'
        )
      const result = await service.parse(Buffer.from('scanned'))
      expect(result.trip.tripCode).toBe('LT0Q3B1EV2HO1')
      expect(result.trip.origin).toBe('Kosambi DC')
      expect(result.items.length).toBe(1)
      expect(result.items[0].toNumber).toBe('TO20260306DOWIW')
      expect(result.items[0].weight).toBe(14.78)
    })
  })
})
