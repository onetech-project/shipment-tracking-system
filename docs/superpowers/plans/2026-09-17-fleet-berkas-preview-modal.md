# Pratinjau Softcopy Berkas dalam Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Lihat" on a fleet softcopy open the file in a modal preview instead of downloading it, across both the Armada (vehicle files) and Sopir (driver SIM) pages.

**Architecture:** The presigned GET is currently always signed with `Content-Disposition: attachment`, so the browser has no choice but to download. The backend gains an optional, validated `disposition` query param that reaches `StorageService.createDownloadUrl`; the frontend gains one shared `FilePreviewDialog` that renders an `<img>` for images and an `<iframe>` for PDFs, fed by a fresh `inline` URL. The Download button re-fetches the same endpoint without the param to get an `attachment` URL.

**Tech Stack:** NestJS + class-validator + @aws-sdk/client-s3 (backend); Next.js App Router + React + @tanstack/react-query + Radix Dialog + Tailwind (frontend); Jest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-17-fleet-berkas-preview-modal-design.md`
- `createDownloadUrl`'s `disposition` parameter defaults to `'attachment'`. Existing callers that pass nothing must keep downloading.
- Allowed disposition values are exactly `'inline'` and `'attachment'`, enforced by `@IsIn`. The value is interpolated into a signed header, so it must come from a closed list.
- Files with `externalUrl` set are never previewed and never signed — they keep opening in a new tab with `noopener,noreferrer`.
- UI copy is Indonesian, matching the surrounding components.
- Comments in this codebase explain *why*, not *what*. Match that density and tone; do not narrate the obvious.
- Backend suite (full run) needs both a heap bump and serial execution:
  `NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter backend test -- --runInBand`
  Single-file runs do not need this.

---

### Task 1: StorageService accepts a disposition

**Files:**
- Modify: `apps/backend/src/modules/storage/storage.service.ts:61-69`
- Test: `apps/backend/src/modules/storage/storage.service.spec.ts:96-103`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `StorageService.createDownloadUrl(key: string, filename: string, disposition?: 'inline' | 'attachment'): Promise<string>` — Tasks 2 and 3 of the backend rely on this third parameter and on its `'attachment'` default.

- [ ] **Step 1: Write the failing tests**

In `apps/backend/src/modules/storage/storage.service.spec.ts`, replace the existing
`it('signs a GET that names the file for the download', ...)` block with these three:

```ts
  it('signs a GET that names the file for the download', async () => {
    const service = build()
    await service.createDownloadUrl('fleet/v1/stnk/abc.pdf', 'STNK B 9114 KYZ.pdf')

    const [, command, options] = getSignedUrl.mock.calls[0]
    expect(command.input.ResponseContentDisposition).toContain('STNK B 9114 KYZ.pdf')
    expect(options).toMatchObject({ expiresIn: 120 })
  })

  // The default is the security-relevant half of this pair: a caller that says nothing must not
  // start serving objects inline because some other caller wanted a preview.
  it('defaults to an attachment when no disposition is asked for', async () => {
    const service = build()
    await service.createDownloadUrl('fleet/v1/stnk/abc.pdf', 'stnk.pdf')

    const [, command] = getSignedUrl.mock.calls[0]
    expect(command.input.ResponseContentDisposition).toMatch(/^attachment;/)
  })

  it('signs a GET the browser will render when asked for inline', async () => {
    const service = build()
    await service.createDownloadUrl('fleet/v1/stnk/abc.pdf', 'stnk.pdf', 'inline')

    const [, command] = getSignedUrl.mock.calls[0]
    expect(command.input.ResponseContentDisposition).toBe('inline; filename="stnk.pdf"')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter backend test -- storage.service.spec.ts -t "inline"
```

Expected: FAIL — `Expected: "inline; filename=\"stnk.pdf\"" Received: "attachment; filename=\"stnk.pdf\""`

- [ ] **Step 3: Implement**

In `apps/backend/src/modules/storage/storage.service.ts`, replace `createDownloadUrl`:

```ts
  // The disposition is the caller's to choose but not the client's: it is signed into the URL, so
  // it comes from a closed list at the controller edge (DownloadUrlQueryDto) and never from raw
  // input. Defaulting to attachment keeps every existing caller downloading.
  async createDownloadUrl(
    key: string,
    filename: string,
    disposition: 'inline' | 'attachment' = 'attachment',
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      // Quotes escaped so a filename containing one cannot terminate the header value early.
      ResponseContentDisposition: `${disposition}; filename="${filename.replace(/"/g, '')}"`,
    })
    return getSignedUrl(this.client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS })
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter backend test -- storage.service.spec.ts
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/storage/storage.service.ts \
        apps/backend/src/modules/storage/storage.service.spec.ts
git commit -m "feat(storage): let a caller ask for a URL the browser will render"
```

---

### Task 2: The two download-url endpoints take a disposition

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/dto/download-url-query.dto.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/download-url-query.dto.spec.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.controller.ts:70-76`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.service.ts:149-162`
- Modify: `apps/backend/src/modules/fleet-drivers/fleet-driver-files.controller.ts:41-45`
- Modify: `apps/backend/src/modules/fleet-drivers/fleet-driver-files.service.ts:68-73`
- Test: `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.controller.spec.ts:62-65`
- Test: `apps/backend/src/modules/fleet-drivers/fleet-driver-files.controller.spec.ts`

**Interfaces:**
- Consumes: `StorageService.createDownloadUrl(key, filename, disposition?)` from Task 1.
- Produces:
  - `class DownloadUrlQueryDto { disposition?: 'inline' | 'attachment' }` — exported from `apps/backend/src/modules/fleet-vehicles/dto/download-url-query.dto.ts`. The driver controller imports it from that same path; it is not duplicated.
  - `FleetVehicleFilesService.downloadUrl(vehicleId: string, fileId: string, disposition?: 'inline' | 'attachment'): Promise<{ url: string }>`
  - `FleetDriverFilesService.downloadUrl(driverId: string, disposition?: 'inline' | 'attachment'): Promise<{ url: string }>`
  - HTTP: `GET /fleet/vehicles/:id/files/:fileId/download-url?disposition=inline` and `GET /fleet/drivers/:id/sim-file/download-url?disposition=inline`. Task 5 (frontend hooks) calls these.

- [ ] **Step 1: Write the failing DTO test**

Create `apps/backend/src/modules/fleet-vehicles/dto/download-url-query.dto.spec.ts`:

```ts
import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { DownloadUrlQueryDto } from './download-url-query.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(DownloadUrlQueryDto, { ...overrides })

describe('DownloadUrlQueryDto', () => {
  // No query at all is the existing download behaviour, which must keep working untouched.
  it('accepts an empty query', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it.each(['inline', 'attachment'])('accepts %s', async (disposition) => {
    expect(await validate(build({ disposition }))).toHaveLength(0)
  })

  // This value is interpolated into a header that gets signed. A free-form string here would let
  // a client write its own Content-Disposition into a URL our credentials vouch for.
  it('refuses a disposition outside the list', async () => {
    const errors = await validate(build({ disposition: 'attachment; filename="x.html"' }))
    expect(errors.map((e) => e.property)).toContain('disposition')
  })

  it('refuses a disposition that is not a string', async () => {
    const errors = await validate(build({ disposition: 1 }))
    expect(errors.map((e) => e.property)).toContain('disposition')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter backend test -- download-url-query.dto.spec.ts
```

Expected: FAIL — `Cannot find module './download-url-query.dto'`

- [ ] **Step 3: Write the DTO**

Create `apps/backend/src/modules/fleet-vehicles/dto/download-url-query.dto.ts`:

```ts
import { IsIn, IsOptional } from 'class-validator'

// A closed list rather than a free string: the value lands inside the Content-Disposition header
// that StorageService signs, so anything accepted here is something our credentials vouch for.
// Absent means attachment, which is what every caller got before this existed.
export class DownloadUrlQueryDto {
  @IsOptional()
  @IsIn(['inline', 'attachment'])
  disposition?: 'inline' | 'attachment'
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter backend test -- download-url-query.dto.spec.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing controller tests**

In `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.controller.spec.ts`, replace
`it('signs a download', ...)` with:

```ts
  it('signs a download', async () => {
    await controller.downloadUrl('v1', 'f1', {})
    expect(service.downloadUrl).toHaveBeenCalledWith('v1', 'f1', undefined)
  })

  it('passes a requested inline disposition through to the service', async () => {
    await controller.downloadUrl('v1', 'f1', { disposition: 'inline' })
    expect(service.downloadUrl).toHaveBeenCalledWith('v1', 'f1', 'inline')
  })
```

In `apps/backend/src/modules/fleet-drivers/fleet-driver-files.controller.spec.ts`, replace
`it('signs a download', ...)` with:

```ts
  it('signs a download', async () => {
    await controller.downloadUrl('d1', {})
    expect(service.downloadUrl).toHaveBeenCalledWith('d1', undefined)
  })

  it('passes a requested inline disposition through to the service', async () => {
    await controller.downloadUrl('d1', { disposition: 'inline' })
    expect(service.downloadUrl).toHaveBeenCalledWith('d1', 'inline')
  })
```

- [ ] **Step 6: Run them to verify they fail**

```bash
pnpm --filter backend test -- fleet-vehicle-files.controller.spec.ts fleet-driver-files.controller.spec.ts
```

Expected: FAIL — `Expected: "v1", "f1", "inline"` / `Received: "v1", "f1"`

- [ ] **Step 7: Wire the vehicle controller and service**

In `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.controller.ts`, add `Query` to the
existing `@nestjs/common` import, add the DTO import alongside the other dto imports:

```ts
import { DownloadUrlQueryDto } from './dto/download-url-query.dto'
```

and replace the `downloadUrl` handler:

```ts
  @Get(':fileId/download-url')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  downloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Query() query: DownloadUrlQueryDto,
  ) {
    return this.service.downloadUrl(id, fileId, query.disposition)
  }
```

In `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.service.ts`, replace the
`downloadUrl` signature and its final line:

```ts
  async downloadUrl(
    vehicleId: string,
    fileId: string,
    disposition?: 'inline' | 'attachment',
  ): Promise<{ url: string }> {
    const file = await this.fileRepo.findOne({
      where: { id: fileId, vehicleId },
      relations: { slot: true },
    })
    if (!file) throw new NotFoundException('File not found')

    // Already a URL. Signing it would be meaningless and the S3 call would fail.
    if (file.externalUrl) return { url: file.externalUrl }
    if (!file.storageKey) throw new NotFoundException('File has no content')

    const filename = file.originalName ?? `${file.slot?.code ?? 'berkas'}`
    return { url: await this.storage.createDownloadUrl(file.storageKey, filename, disposition) }
  }
```

- [ ] **Step 8: Wire the driver controller and service**

In `apps/backend/src/modules/fleet-drivers/fleet-driver-files.controller.ts`, add `Query` to the
existing `@nestjs/common` import, and import the DTO from the vehicles module — the shape is
identical and a second copy is a second thing to keep in step:

```ts
import { DownloadUrlQueryDto } from '../fleet-vehicles/dto/download-url-query.dto'
```

Replace the handler:

```ts
  @Get('download-url')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  downloadUrl(@Param('id', ParseUUIDPipe) id: string, @Query() query: DownloadUrlQueryDto) {
    return this.service.downloadUrl(id, query.disposition)
  }
```

In `apps/backend/src/modules/fleet-drivers/fleet-driver-files.service.ts`, replace `downloadUrl`:

```ts
  async downloadUrl(
    driverId: string,
    disposition?: 'inline' | 'attachment',
  ): Promise<{ url: string }> {
    const driver = await this.assertDriver(driverId)
    if (!driver.simStorageKey) throw new NotFoundException('Driver has no licence scan')
    const filename = driver.simOriginalName ?? `sim-${driver.nama}`
    return { url: await this.storage.createDownloadUrl(driver.simStorageKey, filename, disposition) }
  }
```

- [ ] **Step 9: Run the backend suite**

```bash
NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter backend test -- --runInBand
```

Expected: PASS. Both the heap bump and `--runInBand` are required for the full run; `--runInBand`
alone still core-dumps.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles apps/backend/src/modules/fleet-drivers
git commit -m "feat(fleet): let the caller of a download URL say it means to look"
```

---

### Task 3: FilePreviewDialog

**Files:**
- Create: `apps/frontend/src/features/fleet/components/FilePreviewDialog.tsx`
- Create: `apps/frontend/src/features/fleet/components/FilePreviewDialog.spec.tsx`

**Interfaces:**
- Consumes: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`; default-exported `Spinner` from `@/components/ui/spinner`.
- Produces:
  ```ts
  export type FilePreviewState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; url: string; mimeType: string | null; filename: string | null }

  export function FilePreviewDialog(props: {
    open: boolean
    title: string
    subtitle?: string
    state: FilePreviewState
    onDownload: () => void
    onClose: () => void
  }): JSX.Element | null
  ```
  Tasks 5 and 6 import both the component and the `FilePreviewState` type from this file.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/fleet/components/FilePreviewDialog.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { FilePreviewDialog, FilePreviewState } from './FilePreviewDialog'

const ready = (overrides: Partial<Extract<FilePreviewState, { status: 'ready' }>> = {}) =>
  ({
    status: 'ready' as const,
    url: 'https://files.example.com/presigned?sig=1',
    mimeType: 'image/png',
    filename: 'stnk.png',
    ...overrides,
  })

const renderDialog = (state: FilePreviewState, props: Record<string, unknown> = {}) =>
  render(
    <FilePreviewDialog
      open
      title="Softcopy STNK"
      subtitle="B 9114 KYZ"
      state={state}
      onDownload={jest.fn()}
      onClose={jest.fn()}
      {...props}
    />,
  )

describe('FilePreviewDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog(ready(), { open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('names the slot and the unit it belongs to', () => {
    renderDialog(ready())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Softcopy STNK')).toBeInTheDocument()
    expect(screen.getByText('B 9114 KYZ')).toBeInTheDocument()
  })

  it('shows an image as an image', () => {
    renderDialog(ready({ mimeType: 'image/png' }))
    const img = screen.getByRole('img', { name: 'stnk.png' })
    expect(img).toHaveAttribute('src', 'https://files.example.com/presigned?sig=1')
  })

  // A PDF goes to the browser's own viewer rather than an <img> that would render nothing.
  it('shows a pdf in a frame', () => {
    renderDialog(ready({ mimeType: 'application/pdf', filename: 'stnk.pdf' }))
    const frame = screen.getByTitle('stnk.pdf')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('src', 'https://files.example.com/presigned?sig=1')
  })

  // mimeType comes from a row that may predate the current allow-list. Guessing <img> for an
  // unknown type shows an empty box with no explanation; saying so leaves the download as a way out.
  it('offers a download instead of a blank box for a type it cannot show', () => {
    renderDialog(ready({ mimeType: 'application/msword', filename: 'stnk.doc' }))
    expect(screen.getByText(/pratinjau tidak tersedia/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unduh' })).toBeEnabled()
  })

  it('treats a missing mime type the same way', () => {
    renderDialog(ready({ mimeType: null, filename: null }))
    expect(screen.getByText(/pratinjau tidak tersedia/i)).toBeInTheDocument()
  })

  it('says it is still fetching', () => {
    renderDialog({ status: 'loading' })
    expect(screen.getByRole('status', { name: /memuat berkas/i })).toBeInTheDocument()
  })

  // The download button would fetch a second URL for a file we could not fetch a first one for.
  it('shows the failure and does not offer a download while it stands', () => {
    renderDialog({ status: 'error', message: 'Berkas tidak ditemukan.' })
    expect(screen.getByText('Berkas tidak ditemukan.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unduh' })).not.toBeInTheDocument()
  })

  it('asks its caller to download', async () => {
    const onDownload = jest.fn()
    renderDialog(ready(), { onDownload })
    await userEvent.click(screen.getByRole('button', { name: 'Unduh' }))
    expect(onDownload).toHaveBeenCalledTimes(1)
  })

  it('asks its caller to close', async () => {
    const onClose = jest.fn()
    renderDialog(ready(), { onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Tutup' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter frontend test -- FilePreviewDialog.spec.tsx
```

Expected: FAIL — `Cannot find module './FilePreviewDialog'`

- [ ] **Step 3: Write the component**

Create `apps/frontend/src/features/fleet/components/FilePreviewDialog.tsx`:

```tsx
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
export function FilePreviewDialog({
  open,
  title,
  subtitle,
  state,
  onDownload,
  onClose,
}: Props) {
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
    return (
      <p className="px-6 py-10 text-center text-sm text-destructive">{state.message}</p>
    )
  }

  const name = state.filename ?? 'berkas'

  if (state.mimeType?.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element -- next/image wants a configured remote
    // host, and this src is a presigned URL on whatever endpoint the deployment signs for.
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
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter frontend test -- FilePreviewDialog.spec.tsx
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/fleet/components/FilePreviewDialog.tsx \
        apps/frontend/src/features/fleet/components/FilePreviewDialog.spec.tsx
git commit -m "feat(fleet): a dialog that shows a softcopy rather than fetching it away"
```

---

### Task 4: The download-url hooks forward a disposition

**Files:**
- Modify: `apps/frontend/src/features/fleet/hooks/useFleetVehicleFiles.ts:99-107`
- Modify: `apps/frontend/src/features/fleet/hooks/useDriverSimFile.ts:38-45`
- Test: `apps/frontend/src/features/fleet/hooks/useFleetVehicleFiles.spec.tsx`
- Test: `apps/frontend/src/features/fleet/hooks/useDriverSimFile.spec.tsx`

**Interfaces:**
- Consumes: the endpoints from Task 2.
- Produces:
  - `useFileDownloadUrl()` → `mutateAsync({ vehicleId: string; fileId: string; disposition?: 'inline' | 'attachment' })` resolving to `string`
  - `useDriverSimDownloadUrl()` → `mutateAsync({ driverId: string; disposition?: 'inline' | 'attachment' })` resolving to `string`

  **Note the driver hook's argument changes shape**: it took a bare `driverId: string` and now takes an object. Task 6 updates the only caller.

- [ ] **Step 1: Write the failing tests**

Both spec files mock `@/shared/api/client` and expose it as `const mocked = apiClient as unknown
as Record<string, jest.Mock>`, with a `wrapper` supplying a `QueryClientProvider`. Use those; the
existing tests `await result.current.mutateAsync(...)` directly, with no `act` wrapper.

`useFleetVehicleFiles.spec.tsx` does not currently import or exercise `useFileDownloadUrl` at all.
Add it to the existing import block from `./useFleetVehicleFiles`:

```ts
import {
  useDeleteVehicleFile,
  useFileDownloadUrl,
  useSetExternalUrl,
  useUploadVehicleFile,
  useVehicleFiles,
} from './useFleetVehicleFiles'
```

Then append a new describe block at the end of the file. Note the `mocked.get.mockResolvedValue`
in each test: the file's `beforeEach` primes `get` with a file *list*, which this endpoint does not
return.

```tsx
describe('useFileDownloadUrl', () => {
  // Fetched on demand rather than cached with the row: a presigned GET expires in two minutes, so
  // a URL cached with the row would be dead by the time "Lihat" was clicked.
  it('asks for a URL the browser will render when previewing', async () => {
    mocked.get.mockResolvedValue({ data: { url: 'https://signed/inline' } })
    const { result } = renderHook(() => useFileDownloadUrl(), { wrapper })
    const url = await result.current.mutateAsync({
      vehicleId: 'v1',
      fileId: 'f1',
      disposition: 'inline',
    })

    expect(mocked.get).toHaveBeenCalledWith('/fleet/vehicles/v1/files/f1/download-url', {
      params: { disposition: 'inline' },
    })
    expect(url).toBe('https://signed/inline')
  })

  // No param at all rather than disposition=undefined: the backend's default is the download, and
  // saying nothing is how every caller before this asked for it.
  it('asks for nothing in particular when downloading', async () => {
    mocked.get.mockResolvedValue({ data: { url: 'https://signed/get' } })
    const { result } = renderHook(() => useFileDownloadUrl(), { wrapper })
    await result.current.mutateAsync({ vehicleId: 'v1', fileId: 'f1' })

    expect(mocked.get).toHaveBeenCalledWith('/fleet/vehicles/v1/files/f1/download-url', {
      params: {},
    })
  })
})
```

In `useDriverSimFile.spec.tsx`, replace the whole existing `describe('useDriverSimDownloadUrl',
...)` block — its single test calls `mutateAsync('d1')`, which no longer type-checks:

```tsx
describe('useDriverSimDownloadUrl', () => {
  // Fetched on demand rather than cached with the driver: a presigned GET expires in two
  // minutes, so a URL cached with the row would be dead by the time "Lihat" was clicked.
  it('asks for a URL the browser will render when previewing', async () => {
    mocked.get.mockResolvedValue({ data: { url: 'https://signed/inline' } })
    const { result } = renderHook(() => useDriverSimDownloadUrl(), { wrapper })
    const url = await result.current.mutateAsync({ driverId: 'd1', disposition: 'inline' })

    expect(mocked.get).toHaveBeenCalledWith('/fleet/drivers/d1/sim-file/download-url', {
      params: { disposition: 'inline' },
    })
    expect(url).toBe('https://signed/inline')
  })

  it('asks for nothing in particular when downloading', async () => {
    mocked.get.mockResolvedValue({ data: { url: 'https://signed/get' } })
    const { result } = renderHook(() => useDriverSimDownloadUrl(), { wrapper })
    await result.current.mutateAsync({ driverId: 'd1' })

    expect(mocked.get).toHaveBeenCalledWith('/fleet/drivers/d1/sim-file/download-url', {
      params: {},
    })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm --filter frontend test -- useFleetVehicleFiles.spec.tsx useDriverSimFile.spec.tsx
```

Expected: FAIL — the call is made with no config object, so `toHaveBeenCalledWith` reports one
argument received against two expected.

- [ ] **Step 3: Implement both hooks**

In `apps/frontend/src/features/fleet/hooks/useFleetVehicleFiles.ts`, replace `useFileDownloadUrl`:

```ts
// Fetched on demand rather than cached with the row: a presigned GET expires in two minutes, and
// a cached one would be dead by the time an operator clicked it. That also makes the second fetch
// behind the preview's Unduh button cheap — there was nothing worth keeping from the first.
export function useFileDownloadUrl() {
  return useMutation({
    mutationFn: ({
      vehicleId,
      fileId,
      disposition,
    }: {
      vehicleId: string
      fileId: string
      disposition?: 'inline' | 'attachment'
    }) =>
      apiClient
        .get(`/fleet/vehicles/${vehicleId}/files/${fileId}/download-url`, {
          params: disposition ? { disposition } : {},
        })
        .then((r) => (r.data as { url: string }).url),
  })
}
```

In `apps/frontend/src/features/fleet/hooks/useDriverSimFile.ts`, replace `useDriverSimDownloadUrl`:

```ts
export function useDriverSimDownloadUrl() {
  return useMutation({
    mutationFn: ({
      driverId,
      disposition,
    }: {
      driverId: string
      disposition?: 'inline' | 'attachment'
    }) =>
      apiClient
        .get(`/fleet/drivers/${driverId}/sim-file/download-url`, {
          params: disposition ? { disposition } : {},
        })
        .then((r) => (r.data as { url: string }).url),
  })
}
```

- [ ] **Step 4: Run them to verify they pass**

```bash
pnpm --filter frontend test -- useFleetVehicleFiles.spec.tsx useDriverSimFile.spec.tsx
```

Expected: PASS. `pnpm --filter frontend type-check` will still fail here — the drivers page calls
the driver hook with a bare string, and Task 6 fixes it. Do not chase that error in this task.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/fleet/hooks/useFleetVehicleFiles.ts \
        apps/frontend/src/features/fleet/hooks/useFleetVehicleFiles.spec.tsx \
        apps/frontend/src/features/fleet/hooks/useDriverSimFile.ts \
        apps/frontend/src/features/fleet/hooks/useDriverSimFile.spec.tsx
git commit -m "feat(fleet): let a file hook say whether it means to look or to keep"
```

---

### Task 5: The Armada page previews instead of downloading

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx:137-146` and its imports and JSX
- Modify: `apps/frontend/src/features/fleet/components/BerkasSlotCard.tsx:17-19` (comment only)
- Test: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.spec.tsx:735-767`

**Interfaces:**
- Consumes: `FilePreviewDialog`, `FilePreviewState` (Task 3); `useFileDownloadUrl` with its `disposition` argument (Task 4).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.spec.tsx`, replace the existing
`it('opens an uploaded file through a freshly fetched download url with noopener', ...)` with
the four tests below. They reuse the file fixture that test already builds; keep that shape.

```tsx
    // The slot card's own spec covers its buttons; what belongs here is that "Lihat" now means
    // looking. A fresh presigned URL is still fetched per click — a GET expires in two minutes.
    it('shows an uploaded file in a dialog rather than fetching it away', async () => {
      mockVehicleFiles.mockReturnValue({
        data: [
          {
            id: 'f1',
            slotId: 'jenis_berkas-1',
            slotCode: 'c',
            slotLabel: 'jenis_berkas satu',
            originalName: 'stnk.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            externalUrl: null,
            uploadedAt: '2026-01-01',
          },
        ],
      })
      listResult = {
        data: { rows: [vehicle({ berkasCount: { ada: 1, wajib: 1 } })], total: 1, page: 1, pageSize: 25 },
        ...ok,
      }
      const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
      render(<FleetVehiclesPage />)
      fireEvent.click(screen.getByRole('tab', { name: /softcopy berkas/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Lihat' }))

      await waitFor(() =>
        expect(mutations.downloadUrl).toHaveBeenCalledWith({
          vehicleId: 'v1',
          fileId: 'f1',
          disposition: 'inline',
        }),
      )
      const dialog = within(await screen.findByRole('dialog'))
      expect(dialog.getByTitle('stnk.pdf')).toHaveAttribute(
        'src',
        'https://files.example.com/presigned?sig=1',
      )
      expect(openSpy).not.toHaveBeenCalled()
      openSpy.mockRestore()
    })

    // An arbitrary host can refuse to be framed, and an empty frame reads as a lost document. The
    // link is also not ours to sign, so there is no inline URL to ask for.
    it('still opens an external link in a new tab', async () => {
      mockVehicleFiles.mockReturnValue({
        data: [
          {
            id: 'f1',
            slotId: 'jenis_berkas-1',
            slotCode: 'c',
            slotLabel: 'jenis_berkas satu',
            originalName: null,
            mimeType: null,
            sizeBytes: null,
            externalUrl: 'https://arsip.example/stnk.pdf',
            uploadedAt: '2026-01-01',
          },
        ],
      })
      listResult = {
        data: { rows: [vehicle({ berkasCount: { ada: 1, wajib: 1 } })], total: 1, page: 1, pageSize: 25 },
        ...ok,
      }
      const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
      render(<FleetVehiclesPage />)
      fireEvent.click(screen.getByRole('tab', { name: /softcopy berkas/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Lihat' }))

      await waitFor(() =>
        expect(openSpy).toHaveBeenCalledWith(
          'https://arsip.example/stnk.pdf',
          '_blank',
          'noopener,noreferrer',
        ),
      )
      expect(mutations.downloadUrl).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      openSpy.mockRestore()
    })

    // The failure belongs where the operator is looking, not in a banner behind the dialog.
    it('reports a failed fetch inside the dialog', async () => {
      mockVehicleFiles.mockReturnValue({
        data: [
          {
            id: 'f1',
            slotId: 'jenis_berkas-1',
            slotCode: 'c',
            slotLabel: 'jenis_berkas satu',
            originalName: 'stnk.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            externalUrl: null,
            uploadedAt: '2026-01-01',
          },
        ],
      })
      listResult = {
        data: { rows: [vehicle({ berkasCount: { ada: 1, wajib: 1 } })], total: 1, page: 1, pageSize: 25 },
        ...ok,
      }
      mutations.downloadUrl.mockRejectedValueOnce({
        response: { data: { message: 'Berkas tidak ditemukan.' } },
      })
      render(<FleetVehiclesPage />)
      fireEvent.click(screen.getByRole('tab', { name: /softcopy berkas/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Lihat' }))

      const dialog = within(await screen.findByRole('dialog'))
      expect(await dialog.findByText('Berkas tidak ditemukan.')).toBeInTheDocument()
    })

    // Unduh asks the endpoint again with no disposition: the attachment URL is a different URL,
    // and <a download> is ignored across origins, which is what MinIO is from here.
    it('fetches a second, attachment URL when asked to download', async () => {
      mockVehicleFiles.mockReturnValue({
        data: [
          {
            id: 'f1',
            slotId: 'jenis_berkas-1',
            slotCode: 'c',
            slotLabel: 'jenis_berkas satu',
            originalName: 'stnk.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            externalUrl: null,
            uploadedAt: '2026-01-01',
          },
        ],
      })
      listResult = {
        data: { rows: [vehicle({ berkasCount: { ada: 1, wajib: 1 } })], total: 1, page: 1, pageSize: 25 },
        ...ok,
      }
      const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
      render(<FleetVehiclesPage />)
      fireEvent.click(screen.getByRole('tab', { name: /softcopy berkas/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Lihat' }))
      const dialog = within(await screen.findByRole('dialog'))
      fireEvent.click(await dialog.findByRole('button', { name: 'Unduh' }))

      await waitFor(() =>
        expect(mutations.downloadUrl).toHaveBeenLastCalledWith({ vehicleId: 'v1', fileId: 'f1' }),
      )
      expect(openSpy).toHaveBeenCalledWith(
        'https://files.example.com/presigned?sig=1',
        '_blank',
        'noopener,noreferrer',
      )
      openSpy.mockRestore()
    })
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm --filter frontend test -- "fleet/vehicles/page.spec.tsx"
```

Expected: FAIL — `toHaveBeenCalledWith({vehicleId, fileId, disposition: 'inline'})` receives
`{vehicleId, fileId}`, and no dialog is found.

- [ ] **Step 3: Add the preview state and handlers**

In `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`, add the import next to the other
fleet component imports:

```ts
import {
  FilePreviewDialog,
  FilePreviewState,
} from '@/features/fleet/components/FilePreviewDialog'
```

Add state beside the other `useState` calls in the component:

```ts
  // Separate from `modal`: a preview is opened over whatever the operator was already doing in the
  // Berkas tab, and it carries its own fetch state rather than a vehicle-and-slot selection.
  const [preview, setPreview] = useState<
    { file: FleetVehicleFile; vehicle: FleetVehicle; state: FilePreviewState } | null
  >(null)
```

Replace `handleViewFile` and add `handleDownloadPreview` after it:

```ts
  // A fresh presigned URL per click rather than one cached with the row: a GET expires in two
  // minutes, so a cached one would be dead by the time an operator clicked it.
  const handleViewFile = async (vehicle: FleetVehicle, file: FleetVehicleFile) => {
    setActionError(null)
    // Not ours to sign, and not ours to frame: an arbitrary host may refuse with X-Frame-Options,
    // and an empty frame reads as a lost document rather than an unframeable one.
    if (file.externalUrl) {
      // noopener so the opened document cannot reach back through window.opener.
      window.open(file.externalUrl, '_blank', 'noopener,noreferrer')
      return
    }

    setPreview({ vehicle, file, state: { status: 'loading' } })
    try {
      const url = await downloadUrl.mutateAsync({
        vehicleId: vehicle.id,
        fileId: file.id,
        disposition: 'inline',
      })
      // Keyed on the file so a second click while the first was in flight does not have its
      // answer overwritten by the slower one.
      setPreview((current) =>
        current?.file.id === file.id
          ? {
              ...current,
              state: {
                status: 'ready',
                url,
                mimeType: file.mimeType,
                filename: file.originalName,
              },
            }
          : current,
      )
    } catch (err: unknown) {
      const message = apiErrorMessage(err, 'Gagal membuka berkas.')
      setPreview((current) =>
        current?.file.id === file.id ? { ...current, state: { status: 'error', message } } : current,
      )
    }
  }

  // A second request rather than a saved URL: the inline one is signed with a different
  // disposition, and `<a download>` is ignored across origins — which is what the object store is
  // from here. Two minutes of validity makes the first URL not worth keeping anyway.
  const handleDownloadPreview = async () => {
    if (!preview) return
    const { vehicle, file } = preview
    try {
      const url = await downloadUrl.mutateAsync({ vehicleId: vehicle.id, fileId: file.id })
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      setPreview((current) =>
        current?.file.id === file.id
          ? {
              ...current,
              state: { status: 'error', message: apiErrorMessage(err, 'Gagal mengunduh berkas.') },
            }
          : current,
      )
    }
  }
```

- [ ] **Step 4: Render the dialog**

In the same file, add this beside the other dialogs near the end of the JSX (next to
`BerkasUploadDialog`):

```tsx
      {preview && (
        <FilePreviewDialog
          open
          title={`Softcopy ${preview.file.slotLabel}`}
          subtitle={preview.vehicle.nopol}
          state={preview.state}
          onDownload={() => void handleDownloadPreview()}
          onClose={() => setPreview(null)}
        />
      )}
```

- [ ] **Step 5: Correct the stale comment on BerkasSlotCard**

In `apps/frontend/src/features/fleet/components/BerkasSlotCard.tsx`, replace the comment above the
component. Left as it was, it reads as a prohibition on the preview this change adds:

```tsx
// No preview thumbnail is rendered from file content. The prototype put the raw data URI into an
// <img src> (lines 585, 754), which is precisely the XSS this port removes. The card links to a
// file; "Lihat" opens it in FilePreviewDialog through a presigned URL (spec §4.3), which is a
// different thing from rendering bytes the row carries.
```

- [ ] **Step 6: Run the page spec**

```bash
pnpm --filter frontend test -- "fleet/vehicles/page.spec.tsx"
```

Expected: PASS, whole file.

- [ ] **Step 7: Commit**

```bash
git add "apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx" \
        "apps/frontend/src/app/(dashboard)/fleet/vehicles/page.spec.tsx" \
        apps/frontend/src/features/fleet/components/BerkasSlotCard.tsx
git commit -m "feat(fleet): open a vehicle's softcopy where the operator is standing"
```

---

### Task 6: The Sopir page previews the SIM the same way

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx:59-68` and its imports and JSX
- Test: `apps/frontend/src/app/(dashboard)/fleet/drivers/page.spec.tsx:481-536`

**Interfaces:**
- Consumes: `FilePreviewDialog`, `FilePreviewState` (Task 3); `useDriverSimDownloadUrl` with its new object argument (Task 4).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/app/(dashboard)/fleet/drivers/page.spec.tsx`, replace both
`it('opens a freshly fetched presigned URL for the scan', ...)` and
`it('surfaces a failed view instead of doing nothing', ...)` with:

```tsx
    it('shows the scan in a dialog rather than fetching it away', async () => {
      mockUseFleetDrivers.mockReturnValue({
        data: [driverWithScan],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      })
      mockViewSim.mockResolvedValue('https://signed/inline')
      const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
      render(<FleetDriversPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Ubah' }))
      await userEvent.click(screen.getByRole('button', { name: 'Lihat' }))

      await waitFor(() =>
        expect(mockViewSim).toHaveBeenCalledWith({ driverId: 'd1', disposition: 'inline' }),
      )
      // Two dialogs are open — the driver form underneath, the preview above it. Pick the preview
      // by the image it renders rather than by getByRole('dialog'), which would find both.
      expect(await screen.findByRole('img', { name: 'sim.png' })).toHaveAttribute(
        'src',
        'https://signed/inline',
      )
      expect(openSpy).not.toHaveBeenCalled()
      openSpy.mockRestore()
    })

    // A failed view must not fail silently — an operator clicking "Lihat" on a broken link with
    // no feedback would assume the scan is simply gone. It belongs in the dialog they are looking
    // at, not in the page banner behind it.
    it('surfaces a failed view inside the dialog', async () => {
      mockUseFleetDrivers.mockReturnValue({
        data: [driverWithScan],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      })
      mockViewSim.mockRejectedValue({ response: { data: { message: 'Berkas tidak ditemukan.' } } })
      render(<FleetDriversPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Ubah' }))
      await userEvent.click(screen.getByRole('button', { name: 'Lihat' }))

      expect(await screen.findByText('Berkas tidak ditemukan.')).toBeInTheDocument()
    })

    it('fetches a second, attachment URL when asked to download', async () => {
      mockUseFleetDrivers.mockReturnValue({
        data: [driverWithScan],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      })
      mockViewSim.mockResolvedValue('https://signed/inline')
      const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
      render(<FleetDriversPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Ubah' }))
      await userEvent.click(screen.getByRole('button', { name: 'Lihat' }))
      await screen.findByRole('img', { name: 'sim.png' })

      mockViewSim.mockResolvedValue('https://signed/attachment')
      await userEvent.click(screen.getByRole('button', { name: 'Unduh' }))

      await waitFor(() => expect(mockViewSim).toHaveBeenLastCalledWith({ driverId: 'd1' }))
      expect(openSpy).toHaveBeenCalledWith(
        'https://signed/attachment',
        '_blank',
        'noopener,noreferrer',
      )
      openSpy.mockRestore()
    })
```

`driverWithScan` already exists in this describe block with
`simFile: { originalName: 'sim.png', mimeType: 'image/png', sizeBytes: 524288 }` — leave it as is;
the image assertions above depend on that name and type.

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm --filter frontend test -- "fleet/drivers/page.spec.tsx"
```

Expected: FAIL — `mockViewSim` receives `'d1'` rather than an object, and no image is found.

- [ ] **Step 3: Implement**

In `apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx`, add the import:

```ts
import {
  FilePreviewDialog,
  FilePreviewState,
} from '@/features/fleet/components/FilePreviewDialog'
```

Add state beside the other `useState` calls:

```ts
  // The form dialog stays open underneath: the preview is a look at one of its fields, not a
  // different place to be.
  const [preview, setPreview] = useState<{ driver: FleetDriver; state: FilePreviewState } | null>(
    null,
  )
```

Replace `handleViewSim` and add the download handler after it:

```ts
  // A fresh presigned URL every click, never a cached one: a GET expires in two minutes, the same
  // reason the vehicle files tab re-fetches on every "Lihat".
  const handleViewSim = async (driverId: string) => {
    const driver = (drivers ?? []).find((d) => d.id === driverId)
    if (!driver) return
    setSimError(null)
    setPreview({ driver, state: { status: 'loading' } })
    try {
      const url = await viewSim.mutateAsync({ driverId, disposition: 'inline' })
      setPreview((current) =>
        current?.driver.id === driverId
          ? {
              ...current,
              state: {
                status: 'ready',
                url,
                mimeType: driver.simFile?.mimeType ?? null,
                filename: driver.simFile?.originalName ?? null,
              },
            }
          : current,
      )
    } catch (err: unknown) {
      const message = apiErrorMessage(err, 'Gagal membuka berkas SIM.')
      setPreview((current) =>
        current?.driver.id === driverId ? { ...current, state: { status: 'error', message } } : current,
      )
    }
  }

  // Asking again without a disposition gets the attachment URL. `<a download>` is ignored across
  // origins, and the object store is a different origin from here.
  const handleDownloadSim = async () => {
    if (!preview) return
    const { driver } = preview
    try {
      const url = await viewSim.mutateAsync({ driverId: driver.id })
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      setPreview((current) =>
        current?.driver.id === driver.id
          ? {
              ...current,
              state: {
                status: 'error',
                message: apiErrorMessage(err, 'Gagal mengunduh berkas SIM.'),
              },
            }
          : current,
      )
    }
  }
```

- [ ] **Step 4: Render the dialog**

Add beside `ConfirmDialog` near the end of the JSX:

```tsx
      {preview && (
        <FilePreviewDialog
          open
          title="Softcopy SIM"
          subtitle={preview.driver.nama}
          state={preview.state}
          onDownload={() => void handleDownloadSim()}
          onClose={() => setPreview(null)}
        />
      )}
```

- [ ] **Step 5: Run the page spec**

```bash
pnpm --filter frontend test -- "fleet/drivers/page.spec.tsx"
```

Expected: PASS, whole file.

- [ ] **Step 6: Commit**

```bash
git add "apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx" \
        "apps/frontend/src/app/(dashboard)/fleet/drivers/page.spec.tsx"
git commit -m "feat(fleet): show a driver's licence scan next to the form it belongs to"
```

---

### Task 7: Whole-suite verification

**Files:** none changed unless a check fails.

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: nothing.

- [ ] **Step 1: Type-check the frontend**

```bash
pnpm --filter frontend type-check
```

Expected: exits 0, no output. Task 4 changed `useDriverSimDownloadUrl`'s argument shape; if this
reports a caller still passing a bare string, that caller was missed in Task 6.

- [ ] **Step 2: Lint the frontend**

```bash
pnpm --filter frontend lint
```

Expected: no errors. The `<img>` in FilePreviewDialog carries an inline eslint-disable for
`@next/next/no-img-element`; if lint reports that the disable is unused, the rule is not enabled
here and the comment should be dropped.

- [ ] **Step 3: Run the full frontend suite**

```bash
pnpm --filter frontend test
```

Expected: PASS.

- [ ] **Step 4: Run the full backend suite**

```bash
NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter backend test -- --runInBand
```

Expected: PASS. Both flags are needed; `--runInBand` alone still core-dumps.

- [ ] **Step 5: Commit any fixes**

Only if Steps 1-4 turned something up:

```bash
git add -A
git commit -m "fix(fleet): <what the check caught>"
```
