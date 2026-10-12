'use client'

import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/shared/banner'
import {
  useSettlementPreview,
  useSettlementCommit,
  SettlementPreview,
} from '../hooks/useSettlement'
import { getLastInvoicePeriods, buildCustomPeriod, InvoicePeriodOption } from '../utils/invoicePeriod'
import { num } from '@/features/pnl/utils/format'

const ALLOWED = /\.(xlsx|xls|csv)$/i
const MAX_BYTES = 50 * 1024 * 1024
const CUSTOM_VALUE = '__custom__'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettlementUploadDialog({ open, onClose }: Props) {
  const periodOptions = useMemo(() => getLastInvoicePeriods(4, new Date()), [])
  const [periodChoice, setPeriodChoice] = useState<string>('')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)
  const [preview, setPreview] = useState<SettlementPreview | null>(null)
  const previewMut = useSettlementPreview()
  const commitMut = useSettlementCommit()

  const isCustom = periodChoice === CUSTOM_VALUE
  const selectedPeriod: InvoicePeriodOption | null = isCustom
    ? customStart && customEnd && customStart <= customEnd
      ? buildCustomPeriod(customStart, customEnd)
      : null
    : periodOptions.find((p) => p.label === periodChoice) ?? null

  function reset() {
    setPeriodChoice('')
    setCustomStart('')
    setCustomEnd('')
    setFile(null)
    setClientError(null)
    setPreview(null)
    previewMut.reset()
    commitMut.reset()
  }

  function handleClose() {
    reset()
    onClose()
  }

  function pickFile(f: File | null) {
    setPreview(null)
    setClientError(null)
    commitMut.reset()
    if (f && !ALLOWED.test(f.name)) {
      setFile(null)
      setClientError('Format tidak didukung — gunakan .xlsx, .xls, atau .csv.')
      return
    }
    if (f && f.size > MAX_BYTES) {
      setFile(null)
      setClientError('Ukuran file melebihi 50 MB.')
      return
    }
    setFile(f)
  }

  async function runPreview() {
    if (!file) return
    const res = await previewMut.mutateAsync(file)
    setPreview(res)
  }

  async function runCommit() {
    if (!file || !selectedPeriod) return
    await commitMut.mutateAsync({
      file,
      periodLabel: selectedPeriod.label,
      periodStart: selectedPeriod.start,
      periodEnd: selectedPeriod.end,
    })
  }

  const committed = commitMut.data

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload Invoice — Settle Actual Revenue</DialogTitle>
          <DialogDescription>
            File invoice (.xlsx/.csv) dicocokkan per TO via LT + TO Number. Estimasi tidak diubah.
          </DialogDescription>
        </DialogHeader>

        {!committed ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Periode Invoice</label>
              <select
                className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                value={periodChoice}
                onChange={(e) => {
                  setPeriodChoice(e.target.value)
                  setCustomStart('')
                  setCustomEnd('')
                }}
              >
                <option value="" disabled>Pilih periode…</option>
                {periodOptions.map((p) => (
                  <option key={p.label} value={p.label}>{p.label}</option>
                ))}
                <option value={CUSTOM_VALUE}>Custom</option>
              </select>
              {isCustom && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="rounded-md border bg-background px-3 py-1.5 text-sm"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                  <span className="text-muted-foreground text-sm">—</span>
                  <input
                    type="date"
                    className="rounded-md border bg-background px-3 py-1.5 text-sm"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              )}
              {isCustom && customStart && customEnd && customStart > customEnd && (
                <Banner tone="danger">Tanggal awal tidak boleh setelah tanggal akhir.</Banner>
              )}
            </div>

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={!selectedPeriod}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm disabled:opacity-50"
            />
            {!selectedPeriod && (
              <p className="text-xs text-muted-foreground">Pilih Periode Invoice terlebih dahulu.</p>
            )}
            {clientError && <Banner tone="danger">{clientError}</Banner>}
            {previewMut.isError && (
              <Banner tone="danger">Gagal mem-preview file. Coba lagi.</Banner>
            )}

            {preview && (
              <div className="rounded-md border bg-card p-3 text-sm space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">Baris ter-parse</span>
                  <span className="text-right font-medium">{num(preview.totalParsed)}</span>
                  <span className="text-muted-foreground">Cocok di sistem</span>
                  <span className="text-right font-medium text-good">{num(preview.matched)}</span>
                  <span className="text-muted-foreground">Tidak cocok</span>
                  <span className="text-right font-medium text-warn">{num(preview.unmatched)}</span>
                  <span className="text-muted-foreground">Baris error</span>
                  <span className="text-right font-medium text-destructive">{num(preview.errorRows)}</span>
                  <span className="text-muted-foreground">Duplikat</span>
                  <span className="text-right font-medium">{num(preview.duplicateRows)}</span>
                </div>
                {preview.unmatched > 0 && preview.unmatchedSample.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Contoh tidak cocok: {preview.unmatchedSample.slice(0, 5).map((u) => u.toNumber).join(', ')}
                    {preview.unmatched > 5 ? '…' : ''}
                  </p>
                )}
                {preview.warnings.length > 0 && (
                  <Banner tone="warn">
                    {preview.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </Banner>
                )}
                {preview.matched === 0 && (
                  <Banner tone="danger">
                    Tidak ada baris yang cocok — periksa kolom LT/TO Number pada file.
                  </Banner>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Banner tone="success" title="Settle berhasil.">
              {num(committed.updated)} TO ter-update dengan actual revenue.
            </Banner>
            {committed.unmatched > 0 && (
              <Banner tone="warn">{num(committed.unmatched)} baris tidak cocok (dilewati).</Banner>
            )}
            {committed.errorRows > 0 && (
              <Banner tone="danger">{num(committed.errorRows)} baris error (dilewati).</Banner>
            )}
          </div>
        )}

        <DialogFooter>
          {!committed ? (
            <>
              <Button variant="outline" onClick={handleClose}>Batal</Button>
              {!preview ? (
                <Button onClick={runPreview} disabled={!file || previewMut.isPending}>
                  {previewMut.isPending ? 'Memproses…' : 'Preview'}
                </Button>
              ) : (
                <Button onClick={runCommit} disabled={preview.matched === 0 || !selectedPeriod || commitMut.isPending}>
                  {commitMut.isPending ? 'Menyimpan…' : `Settle ${num(preview.matched)} TO`}
                </Button>
              )}
            </>
          ) : (
            <Button onClick={handleClose}>Selesai</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
