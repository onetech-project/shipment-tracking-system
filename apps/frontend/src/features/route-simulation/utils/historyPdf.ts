import { DAYS_PER_PERIOD, periodShort } from '../engine'
import type { consolidateHistory, historyDetailByPeriod, Sum } from '../engine'
import { fmtIdr, fmtNum, fmtPct } from './format'

export type Unit = 'total' | 'per_kg' | 'per_day' | 'per_period'
export const unitVal = (x: number, weight: number, n: number, u: Unit) =>
  u === 'per_kg' ? (weight > 0 ? x / weight : 0) : u === 'per_day' ? x / (n * DAYS_PER_PERIOD) : u === 'per_period' ? x / n : x

const COLS = ['Rute', 'Tonase (kg)', 'Revenue', 'Rev/kg', 'Cost', 'Cost/kg', 'Margin', 'Margin/kg', 'Margin/hari', 'Margin/periode', 'Margin %']

const line = (label: string, o: Sum, np: number) => [
  label, fmtNum(o.weight), fmtIdr(o.revenue), fmtIdr(unitVal(o.revenue, o.weight, np, 'per_kg')), fmtIdr(o.cost),
  fmtIdr(unitVal(o.cost, o.weight, np, 'per_kg')), fmtIdr(o.margin), fmtIdr(unitVal(o.margin, o.weight, np, 'per_kg')),
  fmtIdr(unitVal(o.margin, o.weight, np, 'per_day')), fmtIdr(unitVal(o.margin, o.weight, np, 'per_period')),
  fmtPct(o.revenue > 0 ? o.margin / o.revenue : 0),
]

// jspdf is ~350 KB; imported on click so the page itself never pays for it.
export async function exportHistoryPdf(args: {
  consolidated: ReturnType<typeof consolidateHistory>
  detail: ReturnType<typeof historyDetailByPeriod>
  periods: string[]
  vendors: string[]
}): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const { consolidated: c, detail, periods, vendors } = args
  const n = c.numPeriods
  const pdfRoute = (r: { originLabel: string; dest: string }) => `${r.originLabel} - ${r.dest}`
  const bold = (cells: string[]) => cells.map((content) => ({ content, styles: { fontStyle: 'bold' as const, fillColor: [241, 245, 249] as [number, number, number] } }))
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const heading = (title: string) => {
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42)
    doc.text(title, 30, 36)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
    doc.text(`Periode: ${periodShort(periods[0])} s.d. ${periodShort(periods[n - 1])} (${n} periode, ${n * DAYS_PER_PERIOD} hari)`, 30, 50)
    doc.text(`Vendor digabung: ${[...vendors].sort().join(', ')}    Bagian: ${c.groups.map((g) => g.name).join(', ')}`, 30, 61, { maxWidth: pageW - 60 })
    doc.setTextColor(0)
  }
  const rightAlign = (from: number, to: number) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, { halign: 'right' as const }]))
  const style = {
    startY: 72, margin: { left: 30, right: 30 },
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' as const },
    headStyles: { fillColor: [15, 23, 42] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
    footStyles: { fillColor: [15, 23, 42] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
    showFoot: 'lastPage' as const,
  }

  heading('Historical PnL: Consolidate per Rute')
  const body1: unknown[][] = []
  for (const g of c.groups) {
    body1.push([{ content: g.name, colSpan: COLS.length, styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }])
    g.rows.forEach((r) => body1.push(line(pdfRoute(r.route) + (r.dupe ? ' *' : ''), r, n)))
    body1.push(bold(line('Subtotal ' + g.name, g.subtotal, n)))
  }
  autoTable(doc, { ...style, head: [COLS], body: body1 as never, foot: [line('Grand Total', c.grand, n)], columnStyles: rightAlign(1, COLS.length - 1) })
  if (c.dupes) {
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    doc.setFontSize(7); doc.setTextColor(100)
    doc.text('* rute tampil di lebih dari satu grup; grand total menghitungnya satu kali', 30, finalY + 12)
    doc.setTextColor(0)
  }

  doc.addPage()
  heading('Historical PnL: Detail per Periode')
  const body2: unknown[][] = []
  for (const p of detail) {
    p.rows.forEach((r) => body2.push([periodShort(p.cycle), ...line(pdfRoute(r.route), r, 1)]))
    body2.push(bold(['Subtotal', ...line(periodShort(p.cycle), p.subtotal, 1)]))
  }
  autoTable(doc, { ...style, head: [['Periode', ...COLS]], body: body2 as never, foot: [['Grand Total', ...line('', c.grand, n)]], columnStyles: rightAlign(2, COLS.length) })

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120)
    doc.text(`Halaman ${i} dari ${pages}`, pageW - 30, pageH - 14, { align: 'right' })
    doc.text(`Dibuat ${new Date().toLocaleString('id-ID')}`, 30, pageH - 14)
  }
  doc.save(`historical-pnl_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`)
}
