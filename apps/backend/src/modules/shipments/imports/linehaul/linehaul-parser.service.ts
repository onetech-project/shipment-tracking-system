import { Injectable, Logger } from '@nestjs/common'
import { execFile } from 'child_process'
import { mkdtemp, rm, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { LinehaulTripDto } from './dto/linehaul-trip.dto'
import { LinehaulTripItemDto } from './dto/linehaul-trip-item.dto'

const execFileAsync = promisify(execFile)

/** Flattened text item with decoded text and position (y=0 at top of page). */
interface TextBlock {
  x: number
  y: number
  text: string
}

/** Tolerances for pdfjs-dist point coordinates (~595×841 for A4). */
const X_CLUSTER_TOLERANCE = 25
const Y_MERGE_TOLERANCE = 3

// Sentinel markers for template detection
export const LINEHAUL_MARKERS = ['Nomor TO', 'Surat Jalan']

// Known table header labels (lowercase) → DTO field mapping
const TABLE_HEADER_MAP: Record<string, string> = {
  'nomor to': 'toNumber',
  'no to': 'toNumber',
  'to number': 'toNumber',
  weight: 'weight',
  berat: 'weight',
  destination: 'destination',
  tujuan: 'destination',
  'dg type': 'dgType',
  'tipe dg': 'dgType',
  'to type': 'toType',
  'tipe to': 'toType',
}

@Injectable()
export class LinehaulParserService {
  private readonly logger = new Logger(LinehaulParserService.name)

  /**
   * Parse a Line Haul Trip PDF buffer using pdfjs-dist positional extraction.
   * Returns a validated LinehaulTripDto with items array, or throws on failure.
   */
  async parse(buffer: Buffer): Promise<{ trip: LinehaulTripDto; items: LinehaulTripItemDto[] }> {
    const blocks = await this.extractTextBlocks(buffer)

    if (blocks.length === 0) {
      // Scanned / image-based PDF — try OCR
      this.logger.log('No text blocks found — attempting OCR extraction')
      const ocrText = await this.extractTextViaOcr(buffer)
      if (!ocrText.trim()) {
        throw new Error('PDF contains no extractable text (OCR also failed)')
      }
      return this.parseRegexFallback(ocrText)
    }

    // Try positional parsing first
    try {
      const result = this.parsePositional(blocks)
      if (result.items.length > 0) {
        return result
      }
      this.logger.warn('Positional parsing yielded no items — falling back to regex')
    } catch (err) {
      this.logger.warn(
        `Positional parsing failed: ${(err as Error).message} — falling back to regex`
      )
    }

    // Fallback to regex-based parsing on merged text
    const fullText = blocks.map((b) => b.text).join('\n')
    return this.parseRegexFallback(fullText)
  }

  // ---------------------------------------------------------------------------
  // PDF extraction via pdfjs-dist
  // ---------------------------------------------------------------------------

  /**
   * Extract positioned text blocks from a PDF buffer using pdfjs-dist.
   * Coordinates use y=0 at top of page (flipped from native PDF coordinates).
   */
  private async extractTextBlocks(buffer: Buffer): Promise<TextBlock[]> {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(buffer)
    const doc = await pdfjsLib.getDocument({ data }).promise
    const blocks: TextBlock[] = []

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const viewport = page.getViewport({ scale: 1.0 })
      const pageHeight = viewport.height
      const content = await page.getTextContent()

      for (const item of content.items as any[]) {
        const str = item.str?.trim()
        if (!str) continue
        blocks.push({
          x: item.transform[4],
          y: pageHeight - item.transform[5],
          text: str,
        })
      }
    }

    return blocks
  }

  // ---------------------------------------------------------------------------
  // Positional parsing
  // ---------------------------------------------------------------------------

  private parsePositional(blocks: TextBlock[]): {
    trip: LinehaulTripDto
    items: LinehaulTripItemDto[]
  } {
    // Find "Nomor TO" block to segment header vs table
    const nomorToBlock = blocks.find((b) => /nomor\s*to/i.test(b.text))
    if (!nomorToBlock) {
      throw new Error('Cannot find "Nomor TO" marker for section segmentation')
    }

    const tableStartY = nomorToBlock.y
    const headerBlocks = blocks.filter((b) => b.y < tableStartY)
    const tableBlocks = blocks.filter((b) => b.y >= tableStartY)

    // Parse header fields
    const trip = this.parseHeader(headerBlocks)

    // Parse table rows
    const items = this.parseTable(tableBlocks)

    return { trip, items }
  }

  private parseHeader(blocks: TextBlock[]): LinehaulTripDto {
    const dto = new LinehaulTripDto()

    // Sort by y then x for sequential scanning
    const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x)
    const fullText = sorted.map((b) => b.text).join(' ')

    // 1. Trip code: LT followed by word chars
    const tripMatch = fullText.match(/\b(LT\w+)\b/)
    if (tripMatch) dto.tripCode = tripMatch[1]

    // 2. Plate number: B followed by 4+ digits (Indonesian plate pattern)
    const plateMatch = fullText.match(/\b(B\s?\d{4,}\s?\w{0,3})\b/)
    if (plateMatch) dto.plateNumber = plateMatch[1].replace(/\s+/g, '')

    // 3. Keyword-proximity extraction
    for (let i = 0; i < sorted.length; i++) {
      const block = sorted[i]
      const textLower = block.text.toLowerCase().trim()

      // Find the closest value block to the right on the same visual line.
      const candidates = sorted.filter(
        (b) => b !== block && Math.abs(b.y - block.y) < Y_MERGE_TOLERANCE && b.x > block.x
      )
      candidates.sort((a, b) => Math.abs(a.y - block.y) - Math.abs(b.y - block.y))
      const rawValue = candidates[0]?.text?.trim()
      // Strip leading ": " prefix common in pdfjs-dist extraction
      const nextValue = rawValue ? rawValue.replace(/^:\s*/, '').trim() : undefined

      // Check specific labels first (STD/STA/ATA) to avoid false matches on "jadwal"
      if (/\bstd\b/i.test(textLower) && nextValue) {
        dto.std = this.parseDateString(nextValue)
      } else if (/\bsta\b/i.test(textLower) && nextValue) {
        dto.sta = this.parseDateString(nextValue)
      } else if (/\bata\b/i.test(textLower) && nextValue) {
        dto.ata = this.parseDateString(nextValue)
      } else if (/\b(origin|asal)\b/i.test(textLower) && nextValue) {
        dto.origin = nextValue
      } else if (/\b(destination|tujuan)\b/i.test(textLower) && nextValue) {
        dto.destination = nextValue
      } else if (/\b(vendor|nama vendor)\b/i.test(textLower) && nextValue) {
        dto.vendor = nextValue
      } else if (/\b(driver|sopir|nama sopir|driver name)\b/i.test(textLower) && nextValue) {
        dto.driverName = nextValue
      } else if (/schedule|jadwal/i.test(textLower) && nextValue) {
        dto.schedule = nextValue
      } else if (/total\s*weight|berat\s*total/i.test(textLower) && nextValue) {
        const num = parseFloat(nextValue.replace(/[^\d.]/g, ''))
        if (!isNaN(num)) dto.totalWeight = num
      }
    }

    // 4. Datetime fallback via regex on full text
    if (!dto.std || !dto.sta) {
      const dateMatches = fullText.match(/\d{4}[-/]\d{2}[-/]\d{2}[\sT]\d{2}:\d{2}(:\d{2})?/g)
      if (dateMatches) {
        if (!dto.std && dateMatches[0]) dto.std = dateMatches[0]
        if (!dto.sta && dateMatches[1]) dto.sta = dateMatches[1]
        if (!dto.ata && dateMatches[2]) dto.ata = dateMatches[2]
      }
    }

    return dto
  }

  private parseTable(blocks: TextBlock[]): LinehaulTripItemDto[] {
    if (blocks.length === 0) return []

    // Identify column clusters from x-coordinates
    const xValues = blocks.map((b) => b.x)
    const clusters = this.clusterXCoordinates(xValues)

    if (clusters.length < 2) {
      // Degenerate case — all x's cluster together; signal for fallback
      throw new Error('Degenerate x-coordinate clustering — table cannot be reconstructed')
    }

    // Sort clusters by x position
    clusters.sort((a, b) => a - b)

    // Map the first row (header row) to column names
    const headerY = Math.min(...blocks.map((b) => b.y))
    const headerBlocks = blocks.filter((b) => Math.abs(b.y - headerY) < Y_MERGE_TOLERANCE)

    const columnMap: Map<number, string> = new Map()
    for (const hb of headerBlocks) {
      const nearestCluster = this.nearestCluster(hb.x, clusters)
      const fieldName = this.matchTableHeader(hb.text)
      if (fieldName) {
        columnMap.set(nearestCluster, fieldName)
      }
    }

    // If no header columns mapped, try best-effort default order
    if (columnMap.size === 0 && clusters.length >= 1) {
      const defaultOrder = ['toNumber', 'weight', 'destination', 'dgType', 'toType']
      clusters.forEach((c, i) => {
        if (i < defaultOrder.length) columnMap.set(c, defaultOrder[i])
      })
    }

    // Group remaining blocks (non-header) into rows by y-coordinate
    const dataBlocks = blocks.filter((b) => b.y - headerY > Y_MERGE_TOLERANCE)
    const rowGroups = this.groupByY(dataBlocks)

    const items: LinehaulTripItemDto[] = []
    for (const rowBlocks of rowGroups) {
      const item = new LinehaulTripItemDto()
      for (const block of rowBlocks) {
        const cluster = this.nearestCluster(block.x, clusters)
        const field = columnMap.get(cluster)
        if (field === 'toNumber') {
          item.toNumber = item.toNumber ? `${item.toNumber} ${block.text}` : block.text
        } else if (field === 'weight') {
          const num = parseFloat(block.text.replace(/[^\d.]/g, ''))
          if (!isNaN(num)) item.weight = num
        } else if (field === 'destination') {
          item.destination = item.destination ? `${item.destination} ${block.text}` : block.text
        } else if (field === 'dgType') {
          item.dgType = block.text
        } else if (field === 'toType') {
          item.toType = block.text
        }
      }
      if (item.toNumber && /^TO/i.test(item.toNumber.trim())) {
        items.push(item)
      }
    }

    return items
  }

  // ---------------------------------------------------------------------------
  // OCR extraction via pdftoppm + tesseract
  // ---------------------------------------------------------------------------

  /**
   * Extract text from a scanned/image PDF via OCR.
   * Uses pdftoppm (poppler-utils) to rasterize pages, then tesseract for OCR.
   */
  async extractTextViaOcr(buffer: Buffer): Promise<string> {
    const tempDir = await mkdtemp(join(tmpdir(), 'linehaul-ocr-'))
    try {
      const pdfPath = join(tempDir, 'input.pdf')
      const { writeFile } = await import('fs/promises')
      await writeFile(pdfPath, buffer)

      // Convert PDF pages to PNG images at 300 DPI
      await execFileAsync('pdftoppm', ['-r', '300', '-png', pdfPath, join(tempDir, 'page')])

      // OCR each page image
      const files = await readdir(tempDir)
      const pageFiles = files.filter((f) => f.startsWith('page') && f.endsWith('.png')).sort()

      const pages: string[] = []
      for (const pageFile of pageFiles) {
        const imgPath = join(tempDir, pageFile)
        const { stdout } = await execFileAsync('tesseract', [imgPath, 'stdout'], {
          maxBuffer: 10 * 1024 * 1024,
        })
        pages.push(stdout)
      }

      return pages.join('\n')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  // ---------------------------------------------------------------------------
  // Regex fallback
  // ---------------------------------------------------------------------------

  private parseRegexFallback(text: string): {
    trip: LinehaulTripDto
    items: LinehaulTripItemDto[]
  } {
    const dto = new LinehaulTripDto()
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    // Extract header fields via regex
    const tripMatch = text.match(/\b(LT[A-Z0-9]{5,})\b/i)
    if (tripMatch) dto.tripCode = tripMatch[1]

    const plateMatch = text.match(/\b(B\s?\d{4,}\s?\w{0,3})\b/)
    if (plateMatch) dto.plateNumber = plateMatch[1].replace(/\s+/g, '')

    // Key-value extraction from lines — supports : = - > ' * separators (OCR artifacts)
    for (const line of lines) {
      const kvMatch = line.match(/^(.+?)\s*[-:=>'*]\s+(.+)$/)
      if (!kvMatch) continue
      const [, key, value] = kvMatch
      const keyLower = key.toLowerCase().trim()

      // Check specific labels first (STD/STA/ATA) before schedule/jadwal
      if (/\bstd\b/i.test(keyLower)) {
        if (!dto.std) dto.std = this.parseDateString(value.trim())
      } else if (/\bsta\b/i.test(keyLower)) {
        if (!dto.sta) dto.sta = this.parseDateString(value.trim())
      } else if (/\bata\b/i.test(keyLower)) {
        if (!dto.ata) dto.ata = this.parseDateString(value.trim())
      } else if (/\bschedule\s*\/\s*adhoc\b/i.test(keyLower)) {
        if (!dto.schedule) {
          // Clean OCR noise: "Schedule Jumlah TO ..." → just "Schedule"
          const cleanVal = value.trim().split(/\s+/)[0]
          dto.schedule = cleanVal
        }
      } else if (/\b(origin|asal)\b/.test(keyLower)) {
        if (!dto.origin) dto.origin = value.trim()
      } else if (/\b(destination|tujuan)\b/.test(keyLower)) {
        if (!dto.destination) dto.destination = value.trim()
      } else if (
        /\bnama\s*vendor\b/i.test(keyLower) ||
        (/\bvendor\b/.test(keyLower) && !/jumlah/i.test(value))
      ) {
        if (!dto.vendor) {
          // Clean OCR noise: "'ESP 151 0 4550" → "ESP"
          const cleanVal = value
            .trim()
            .replace(/^[^A-Za-z]+/, '')
            .split(/\s+\d/)[0]
            .trim()
          dto.vendor = cleanVal
        }
      } else if (/\b(driver|sopir)\b/.test(keyLower)) {
        if (!dto.driverName) dto.driverName = value.trim()
      } else if (/total.*weight|berat.*total/.test(keyLower)) {
        const num = parseFloat(value.replace(/[^\d.]/g, ''))
        if (!isNaN(num)) dto.totalWeight = num
      }
      // Plate number from "Nomor Polisi" line
      if (/nomor\s*polisi/i.test(keyLower) && !dto.plateNumber) {
        dto.plateNumber = value.trim().replace(/\s+/g, '')
      }
    }

    // Fallback: extract origin/destination from route arrow pattern in trip name
    // Handles OCR formats like "Kosambi DC > Batam DC" possibly split across lines
    if (!dto.origin || !dto.destination) {
      const fullText = lines.join(' ')
      const routeMatch = fullText.match(
        /([A-Z][A-Za-z\s]*?(?:DC|Hub|Warehouse))\s*[->»>]+\s*([A-Z][A-Za-z\s]*?(?:DC|Hub|Warehouse))\b/
      )
      if (routeMatch) {
        if (!dto.origin) dto.origin = routeMatch[1].trim()
        if (!dto.destination) dto.destination = routeMatch[2].trim()
      }
    }

    // Fallback: look for standalone "Origin"/"Destination" labels followed by a
    // location-like value on a nearby subsequent line
    if (!dto.origin || !dto.destination) {
      for (let i = 0; i < lines.length; i++) {
        const stripped = lines[i]
          .replace(/^[^A-Za-z]+/, '')
          .trim()
          .toLowerCase()
        if (stripped === 'origin' && !dto.origin) {
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const locMatch = lines[j].match(/([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]*)*\s+DC)\b/)
            if (locMatch) {
              dto.origin = locMatch[1].trim()
              break
            }
          }
        } else if (stripped === 'destination' && !dto.destination) {
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const cleaned = lines[j].replace(/^[^A-Za-z]+/, '')
            const locMatch = cleaned.match(/([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]*)*\s+DC)\b/)
            if (locMatch) {
              dto.destination = locMatch[1].trim()
              break
            }
          }
        }
      }
    }

    // Extract table items — parse OCR table rows with weight/destination
    // OCR output varies widely, so parse line-by-line for rows containing TO numbers
    const seen = new Set<string>()
    const items: LinehaulTripItemDto[] = []

    for (const line of lines) {
      // Clean OCR artifacts: pipes, underscores, semicolons used as separators
      const cleaned = line.replace(/[|_;{}\[\]]/g, ' ').replace(/\s+/g, ' ')

      // Look for a TO number in the line
      const toMatch = cleaned.match(/\b(TO[-]?[A-Z0-9]{5,})\b/i)
      if (!toMatch) continue

      const toNumber = toMatch[1].replace(/[\s-]+/g, (match) => (match.includes('-') ? '-' : ''))
      // Deduplicate across pages (scanned PDFs repeat headers per page)
      if (seen.has(toNumber)) continue
      seen.add(toNumber)

      const item = new LinehaulTripItemDto()
      item.toNumber = toNumber

      // Extract weight: look for decimal numbers (e.g., 14.780, 2.460)
      const afterTo = cleaned.substring(toMatch.index! + toMatch[0].length)
      const weightMatch = afterTo.match(/\b(\d+\.\d{2,})\b/)
      if (weightMatch) {
        const weight = parseFloat(weightMatch[1])
        if (!isNaN(weight)) item.weight = weight
      }

      // Extract destination: look for known location pattern after TO number
      const destMatch = afterTo.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]*)*\s+DC)\b/)
      if (destMatch) {
        item.destination = destMatch[1].trim()
      }

      items.push(item)
    }

    // Fallback: infer destination from item table data if all items share one
    if (!dto.destination && items.length > 0) {
      const destCounts = new Map<string, number>()
      for (const item of items) {
        if (item.destination) {
          destCounts.set(item.destination, (destCounts.get(item.destination) ?? 0) + 1)
        }
      }
      if (destCounts.size > 0) {
        dto.destination = [...destCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      }
    }

    return { trip: dto, items }
  }

  // ---------------------------------------------------------------------------
  // Clustering & grouping utilities
  // ---------------------------------------------------------------------------

  private clusterXCoordinates(values: number[]): number[] {
    if (values.length === 0) return []
    const sorted = [...new Set(values)].sort((a, b) => a - b)
    const clusters: number[] = []
    let currentCluster = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] <= X_CLUSTER_TOLERANCE) {
        currentCluster.push(sorted[i])
      } else {
        clusters.push(currentCluster.reduce((s, v) => s + v, 0) / currentCluster.length)
        currentCluster = [sorted[i]]
      }
    }
    clusters.push(currentCluster.reduce((s, v) => s + v, 0) / currentCluster.length)

    return clusters
  }

  private nearestCluster(x: number, clusters: number[]): number {
    let nearest = clusters[0]
    let minDist = Math.abs(x - clusters[0])
    for (let i = 1; i < clusters.length; i++) {
      const dist = Math.abs(x - clusters[i])
      if (dist < minDist) {
        minDist = dist
        nearest = clusters[i]
      }
    }
    return nearest
  }

  /** Match a table header text against known column names (fuzzy: includes-based). */
  private matchTableHeader(text: string): string | undefined {
    const lower = text.toLowerCase().trim()
    // Exact match first
    if (TABLE_HEADER_MAP[lower]) return TABLE_HEADER_MAP[lower]
    // Fuzzy: check if any key is contained in the text
    for (const [key, field] of Object.entries(TABLE_HEADER_MAP)) {
      if (lower.includes(key)) return field
    }
    return undefined
  }

  private groupByY(blocks: TextBlock[]): TextBlock[][] {
    if (blocks.length === 0) return []
    const sorted = [...blocks].sort((a, b) => a.y - b.y)
    const groups: TextBlock[][] = []
    let currentGroup = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].y - sorted[i - 1].y <= Y_MERGE_TOLERANCE) {
        currentGroup.push(sorted[i])
      } else {
        groups.push(currentGroup)
        currentGroup = [sorted[i]]
      }
    }
    groups.push(currentGroup)
    return groups
  }

  private parseDateString(value: string): string | null {
    if (!value) return null
    // Try ISO format first
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d.toISOString()
    return value
  }
}
