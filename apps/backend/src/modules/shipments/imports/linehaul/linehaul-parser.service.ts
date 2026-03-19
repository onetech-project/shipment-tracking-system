import { Injectable, Logger } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LinehaulTripDto } from './dto/linehaul-trip.dto';
import { LinehaulTripItemDto } from './dto/linehaul-trip-item.dto';

// pdf2json text item from Pages[].Texts[]
interface PdfTextItem {
  x: number;
  y: number;
  R: { T: string; TS?: number[] }[];
}

interface PdfPage {
  Texts: PdfTextItem[];
}

interface Pdf2JsonOutput {
  Pages: PdfPage[];
}

/** Flattened text item with decoded text and position. */
interface TextBlock {
  x: number;
  y: number;
  text: string;
}

const X_CLUSTER_TOLERANCE = 10;
const Y_MERGE_TOLERANCE = 1.5;

// Sentinel markers for template detection
export const LINEHAUL_MARKERS = ['Nomor TO', 'Surat Jalan'];

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
};

@Injectable()
export class LinehaulParserService {
  private readonly logger = new Logger(LinehaulParserService.name);

  /**
   * Parse a Line Haul Trip PDF buffer using pdf2json positional extraction.
   * Returns a validated LinehaulTripDto with items array, or throws on failure.
   */
  async parse(buffer: Buffer): Promise<{ trip: LinehaulTripDto; items: LinehaulTripItemDto[] }> {
    const pdfData = await this.extractPdfData(buffer);
    const blocks = this.flattenTextBlocks(pdfData);

    if (blocks.length === 0) {
      throw new Error('PDF contains no extractable text');
    }

    // Try positional parsing first
    try {
      const result = this.parsePositional(blocks);
      if (result.items.length > 0) {
        return result;
      }
      this.logger.warn('Positional parsing yielded no items — falling back to regex');
    } catch (err) {
      this.logger.warn(`Positional parsing failed: ${(err as Error).message} — falling back to regex`);
    }

    // Fallback to regex-based parsing
    const fullText = blocks.map((b) => b.text).join('\n');
    return this.parseRegexFallback(fullText);
  }

  // ---------------------------------------------------------------------------
  // PDF extraction
  // ---------------------------------------------------------------------------

  private async extractPdfData(buffer: Buffer): Promise<Pdf2JsonOutput> {
    // pdf2json v3.x uses class-based API
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFParser = require('pdf2json');

    return new Promise<Pdf2JsonOutput>((resolve, reject) => {
      const parser = new PDFParser(null, true);

      parser.on('pdfParser_dataError', (errData: { parserError: string }) => {
        reject(new Error(`pdf2json parse error: ${errData.parserError}`));
      });

      parser.on('pdfParser_dataReady', (pdfData: Pdf2JsonOutput) => {
        resolve(pdfData);
      });

      parser.parseBuffer(buffer);
    });
  }

  private flattenTextBlocks(pdfData: Pdf2JsonOutput): TextBlock[] {
    const blocks: TextBlock[] = [];
    for (const page of pdfData.Pages ?? []) {
      for (const item of page.Texts ?? []) {
        const text = (item.R ?? [])
          .map((r) => decodeURIComponent(r.T))
          .join('')
          .trim();
        if (text) {
          blocks.push({ x: item.x, y: item.y, text });
        }
      }
    }
    return blocks;
  }

  // ---------------------------------------------------------------------------
  // Positional parsing
  // ---------------------------------------------------------------------------

  private parsePositional(blocks: TextBlock[]): { trip: LinehaulTripDto; items: LinehaulTripItemDto[] } {
    // Find "Nomor TO" block to segment header vs table
    const nomorToBlock = blocks.find((b) => /nomor\s*to/i.test(b.text));
    if (!nomorToBlock) {
      throw new Error('Cannot find "Nomor TO" marker for section segmentation');
    }

    const tableStartY = nomorToBlock.y;
    const headerBlocks = blocks.filter((b) => b.y < tableStartY);
    const tableBlocks = blocks.filter((b) => b.y >= tableStartY);

    // Parse header fields
    const trip = this.parseHeader(headerBlocks);

    // Parse table rows
    const items = this.parseTable(tableBlocks);

    return { trip, items };
  }

  private parseHeader(blocks: TextBlock[]): LinehaulTripDto {
    const dto = new LinehaulTripDto();

    // Sort by y then x for sequential scanning
    const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
    const fullText = sorted.map((b) => b.text).join(' ');

    // 1. Trip code: LT followed by word chars
    const tripMatch = fullText.match(/\b(LT\w+)\b/);
    if (tripMatch) dto.tripCode = tripMatch[1];

    // 2. Plate number: B followed by 4+ digits (Indonesian plate pattern)
    const plateMatch = fullText.match(/\b(B\s?\d{4,}\s?\w{0,3})\b/);
    if (plateMatch) dto.plateNumber = plateMatch[1].replace(/\s+/g, '');

    // 3. Keyword-proximity extraction
    for (let i = 0; i < sorted.length; i++) {
      const block = sorted[i];
      const textLower = block.text.toLowerCase().trim();

      // Find value in the block directly following a label on the same line
      const nextOnLine = sorted.find(
        (b) => b !== block && Math.abs(b.y - block.y) < Y_MERGE_TOLERANCE && b.x > block.x,
      );
      const nextValue = nextOnLine?.text?.trim();

      if (/schedule|jadwal/i.test(textLower) && nextValue) {
        dto.schedule = nextValue;
      } else if (/\b(origin|asal)\b/i.test(textLower) && nextValue) {
        dto.origin = nextValue;
      } else if (/\b(destination|tujuan)\b/i.test(textLower) && nextValue) {
        dto.destination = nextValue;
      } else if (/\b(vendor|nama vendor)\b/i.test(textLower) && nextValue) {
        dto.vendor = nextValue;
      } else if (/\b(driver|sopir|nama sopir|driver name)\b/i.test(textLower) && nextValue) {
        dto.driverName = nextValue;
      } else if (/\bstd\b/i.test(textLower) && nextValue) {
        dto.std = this.parseDateString(nextValue);
      } else if (/\bsta\b/i.test(textLower) && nextValue) {
        dto.sta = this.parseDateString(nextValue);
      } else if (/\bata\b/i.test(textLower) && nextValue) {
        dto.ata = this.parseDateString(nextValue);
      } else if (/total\s*weight|berat\s*total/i.test(textLower) && nextValue) {
        const num = parseFloat(nextValue.replace(/[^\d.]/g, ''));
        if (!isNaN(num)) dto.totalWeight = num;
      }
    }

    // 4. Datetime fallback via regex on full text
    if (!dto.std || !dto.sta) {
      const dateMatches = fullText.match(
        /\d{4}[-/]\d{2}[-/]\d{2}[\sT]\d{2}:\d{2}(:\d{2})?/g,
      );
      if (dateMatches) {
        if (!dto.std && dateMatches[0]) dto.std = dateMatches[0];
        if (!dto.sta && dateMatches[1]) dto.sta = dateMatches[1];
        if (!dto.ata && dateMatches[2]) dto.ata = dateMatches[2];
      }
    }

    return dto;
  }

  private parseTable(blocks: TextBlock[]): LinehaulTripItemDto[] {
    if (blocks.length === 0) return [];

    // Identify column clusters from x-coordinates
    const xValues = blocks.map((b) => b.x);
    const clusters = this.clusterXCoordinates(xValues);

    if (clusters.length < 2) {
      // Degenerate case — all x's cluster together; signal for fallback
      throw new Error('Degenerate x-coordinate clustering — table cannot be reconstructed');
    }

    // Sort clusters by x position
    clusters.sort((a, b) => a - b);

    // Map the first row (header row) to column names
    const headerY = Math.min(...blocks.map((b) => b.y));
    const headerBlocks = blocks.filter((b) => Math.abs(b.y - headerY) < Y_MERGE_TOLERANCE);

    const columnMap: Map<number, string> = new Map();
    for (const hb of headerBlocks) {
      const nearestCluster = this.nearestCluster(hb.x, clusters);
      const fieldName = TABLE_HEADER_MAP[hb.text.toLowerCase().trim()];
      if (fieldName) {
        columnMap.set(nearestCluster, fieldName);
      }
    }

    // If no header columns mapped, try best-effort default order
    if (columnMap.size === 0 && clusters.length >= 1) {
      const defaultOrder = ['toNumber', 'weight', 'destination', 'dgType', 'toType'];
      clusters.forEach((c, i) => {
        if (i < defaultOrder.length) columnMap.set(c, defaultOrder[i]);
      });
    }

    // Group remaining blocks (non-header) into rows by y-coordinate
    const dataBlocks = blocks.filter((b) => b.y - headerY > Y_MERGE_TOLERANCE);
    const rowGroups = this.groupByY(dataBlocks);

    const items: LinehaulTripItemDto[] = [];
    for (const rowBlocks of rowGroups) {
      const item = new LinehaulTripItemDto();
      for (const block of rowBlocks) {
        const cluster = this.nearestCluster(block.x, clusters);
        const field = columnMap.get(cluster);
        if (field === 'toNumber') {
          item.toNumber = item.toNumber ? `${item.toNumber} ${block.text}` : block.text;
        } else if (field === 'weight') {
          const num = parseFloat(block.text.replace(/[^\d.]/g, ''));
          if (!isNaN(num)) item.weight = num;
        } else if (field === 'destination') {
          item.destination = item.destination ? `${item.destination} ${block.text}` : block.text;
        } else if (field === 'dgType') {
          item.dgType = block.text;
        } else if (field === 'toType') {
          item.toType = block.text;
        }
      }
      if (item.toNumber) {
        items.push(item);
      }
    }

    return items;
  }

  // ---------------------------------------------------------------------------
  // Regex fallback
  // ---------------------------------------------------------------------------

  private parseRegexFallback(text: string): { trip: LinehaulTripDto; items: LinehaulTripItemDto[] } {
    const dto = new LinehaulTripDto();
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // Extract header fields via regex
    const tripMatch = text.match(/\b(LT\w+)\b/);
    if (tripMatch) dto.tripCode = tripMatch[1];

    const plateMatch = text.match(/\b(B\s?\d{4,}\s?\w{0,3})\b/);
    if (plateMatch) dto.plateNumber = plateMatch[1].replace(/\s+/g, '');

    // Key-value extraction from lines
    for (const line of lines) {
      const kvMatch = line.match(/^(.+?)\s*[:=]\s*(.+)$/);
      if (!kvMatch) continue;
      const [, key, value] = kvMatch;
      const keyLower = key.toLowerCase().trim();

      if (/schedule|jadwal/.test(keyLower)) dto.schedule = value.trim();
      else if (/\b(origin|asal)\b/.test(keyLower)) dto.origin = value.trim();
      else if (/\b(destination|tujuan)\b/.test(keyLower)) dto.destination = value.trim();
      else if (/\bvendor\b/.test(keyLower)) dto.vendor = value.trim();
      else if (/\b(driver|sopir)\b/.test(keyLower)) dto.driverName = value.trim();
      else if (/\bstd\b/.test(keyLower)) dto.std = this.parseDateString(value.trim());
      else if (/\bsta\b/.test(keyLower)) dto.sta = this.parseDateString(value.trim());
      else if (/\bata\b/.test(keyLower)) dto.ata = this.parseDateString(value.trim());
      else if (/total.*weight|berat.*total/.test(keyLower)) {
        const num = parseFloat(value.replace(/[^\d.]/g, ''));
        if (!isNaN(num)) dto.totalWeight = num;
      }
    }

    // Extract table items — look for lines that look like TO numbers
    const items: LinehaulTripItemDto[] = [];
    const toPattern = /\b(TO[-\s]?\w{5,})\b/gi;
    let match;
    while ((match = toPattern.exec(text)) !== null) {
      const item = new LinehaulTripItemDto();
      item.toNumber = match[1].replace(/\s+/g, '');
      items.push(item);
    }

    return { trip: dto, items };
  }

  // ---------------------------------------------------------------------------
  // Clustering & grouping utilities
  // ---------------------------------------------------------------------------

  private clusterXCoordinates(values: number[]): number[] {
    if (values.length === 0) return [];
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    const clusters: number[] = [];
    let currentCluster = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] <= X_CLUSTER_TOLERANCE) {
        currentCluster.push(sorted[i]);
      } else {
        clusters.push(currentCluster.reduce((s, v) => s + v, 0) / currentCluster.length);
        currentCluster = [sorted[i]];
      }
    }
    clusters.push(currentCluster.reduce((s, v) => s + v, 0) / currentCluster.length);

    return clusters;
  }

  private nearestCluster(x: number, clusters: number[]): number {
    let nearest = clusters[0];
    let minDist = Math.abs(x - clusters[0]);
    for (let i = 1; i < clusters.length; i++) {
      const dist = Math.abs(x - clusters[i]);
      if (dist < minDist) {
        minDist = dist;
        nearest = clusters[i];
      }
    }
    return nearest;
  }

  private groupByY(blocks: TextBlock[]): TextBlock[][] {
    if (blocks.length === 0) return [];
    const sorted = [...blocks].sort((a, b) => a.y - b.y);
    const groups: TextBlock[][] = [];
    let currentGroup = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].y - sorted[i - 1].y <= Y_MERGE_TOLERANCE) {
        currentGroup.push(sorted[i]);
      } else {
        groups.push(currentGroup);
        currentGroup = [sorted[i]];
      }
    }
    groups.push(currentGroup);
    return groups;
  }

  private parseDateString(value: string): string | null {
    if (!value) return null;
    // Try ISO format first
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
    return value;
  }
}
