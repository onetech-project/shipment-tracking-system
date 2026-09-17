'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Spinner from '@/components/ui/spinner'

export type FilePreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; url: string; mimeType: string | null; filename: string | null }

interface Props {
  open: boolean
  title: string
  subtitle?: string
  state: FilePreviewState
  onDownload: () => void
  onClose: () => void
}

// Knows nothing about vehicles or drivers: it is handed a URL and told what is behind it. Both
// fleet pages fetch that URL their own way, through endpoints that do not share a shape.
export function FilePreviewDialog({ open, title, subtitle, state, onDownload, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </DialogHeader>

        <div className="flex min-h-64 flex-1 items-center justify-center overflow-auto rounded-md border bg-muted/30">
          <PreviewBody state={state} />
        </div>

        <DialogFooter>
          {/* Absent on a failure: it would fetch a second URL for a file we could not fetch a
              first one for, and hand the operator the same error twice. */}
          {state.status === 'ready' && (
            <Button variant="outline" onClick={onDownload}>
              Unduh
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewBody({ state }: { state: FilePreviewState }) {
  if (state.status === 'loading') {
    return <Spinner ariaLabel="Memuat berkas" />
  }

  if (state.status === 'error') {
    return <p className="px-6 py-10 text-center text-sm text-destructive">{state.message}</p>
  }

  const name = state.filename ?? 'berkas'

  if (state.mimeType?.startsWith('image/')) {
    // next/image wants its remote hosts configured up front; this src is a presigned URL on
    // whatever endpoint the deployment signs for, which is an env var, not a build-time constant.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={state.url} alt={name} className="max-h-[70vh] w-auto object-contain" />
  }

  if (state.mimeType === 'application/pdf') {
    return <iframe src={state.url} title={name} className="h-[70vh] w-full" />
  }

  // mimeType is whatever the row says, which may predate the current allow-list. An <img> guessed
  // here renders an empty box that reads as a lost file rather than an unshowable one.
  return (
    <p className="px-6 py-10 text-center text-sm text-muted-foreground">
      Pratinjau tidak tersedia untuk jenis berkas ini. Unduh untuk membukanya.
    </p>
  )
}
