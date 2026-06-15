'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  useSettlementPreview,
  useSettlementCommit,
  SettlementPreview,
} from '../hooks/useSettlement'
import { num } from '@/features/pnl/utils/format'

const ALLOWED = /\.(xlsx|xls|csv)$/i
const MAX_BYTES = 10 * 1024 * 1024

interface Props {
  open: boolean
  onClose: () => void
}

export function SettlementUploadDialog({ open, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)
  const [preview, setPreview] = useState<SettlementPreview | null>(null)
  const previewMut = useSettlementPreview()
  const commitMut = useSettlementCommit()

  function reset() {
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
      setClientError('Ukuran file melebihi 10 MB.')
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
    if (!file) return
    await commitMut.mutateAsync(file)
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
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            />
            {clientError && <p className="text-sm text-destructive">{clientError}</p>}
            {previewMut.isError && (
              <p className="text-sm text-destructive">Gagal mem-preview file. Coba lagi.</p>
            )}

            {preview && (
              <div className="rounded-md border bg-card p-3 text-sm space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">Baris ter-parse</span>
                  <span className="text-right font-medium">{num(preview.totalParsed)}</span>
                  <span className="text-muted-foreground">Cocok di sistem</span>
                  <span className="text-right font-medium text-green-600">{num(preview.matched)}</span>
                  <span className="text-muted-foreground">Tidak cocok</span>
                  <span className="text-right font-medium text-amber-600">{num(preview.unmatched)}</span>
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
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600">{w}</p>
                ))}
                {preview.matched === 0 && (
                  <p className="text-xs text-destructive">
                    Tidak ada baris yang cocok — periksa kolom LT/TO Number pada file.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border bg-card p-4 text-sm space-y-1">
            <p className="font-medium text-green-600">Settle berhasil.</p>
            <p>{num(committed.updated)} TO ter-update dengan actual revenue.</p>
            {committed.unmatched > 0 && (
              <p className="text-amber-600">{num(committed.unmatched)} baris tidak cocok (dilewati).</p>
            )}
            {committed.errorRows > 0 && (
              <p className="text-destructive">{num(committed.errorRows)} baris error (dilewati).</p>
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
                <Button onClick={runCommit} disabled={preview.matched === 0 || commitMut.isPending}>
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
