# Master Data "Wajib" Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give operators a checkbox in the Master Data form that sets `is_required`, so document
and file policy can change without a deploy.

**Architecture:** The column is already wired from database through entity, DTO and service; only
the form control and the table column are missing. Three layers change: a migration backfills the
ambiguous `NULL`s to `FALSE`, the service defaults new rows to `FALSE` for the two categories that
read the flag, and the frontend gains a conditional checkbox plus a conditional table column.

**Tech Stack:** NestJS + TypeORM (backend), Next.js + React Testing Library (frontend), Jest both
sides.

**Spec:** `docs/superpowers/specs/2026-09-22-master-data-required-toggle-design.md`

## Global Constraints

- **Only two categories carry this flag:** `jenis_berkas` and `jenis_dokumen`. The other six
  (`jenis_armada`, `kepemilikan`, `leasing`, `status_kendaraan`, `pool`, `jenis_sim`) must be left
  untouched in both the migration and the UI.
- **User-facing copy is Indonesian.** Everything else in the codebase stays English.
- **Never default `isRequired` to `true`.** A new required slot raises the completeness
  denominator for every vehicle at once.
- **`/home/faris/code/esp/esp-dashboard/.superpowers/sdd/FLEET-RULES.md` is BINDING on this branch
  and overrides anything in this plan it contradicts. Read it by absolute path before you start.**
- **Every jest command caps workers** (`--maxWorkers=1 --workerIdleMemoryLimit=512MB`). A bare run
  spawns ~15 ts-jest workers and the OOM killer takes them out; the tell is "N suites failed" with
  **0 individual tests failed**. Never raise `--maxWorkers` above 1.
- **Judge every jest run by its EXIT CODE, never by grepping stdout.** The `rtk` wrapper reorders
  jest output and has produced false green reports here. Redirect to your own `/tmp` log and make
  `echo "EXIT=$?"` the very next command — a pipe or second command overwrites it.
- **Never pass a path containing `(dashboard)` to jest.** Positional args are *regexes*, so
  `(dashboard)` is a capture group matching the bare string `dashboard`, which no path contains —
  it matches ZERO files. Alone that exits 1; named alongside other specs the run exits **0 on the
  others' strength while that suite never runs**, a false green. Use the paren-free substring
  `fleet/master-data/page.spec`, and always confirm the `Test Suites: N passed` line matches the
  number of files you named.
- Use `FALSE`/`TRUE` uppercase in migration SQL, matching `20260912000003`.

## File Structure

**Backend**
- Create: `apps/backend/src/database/migrations/20260922000001-fleet-required-flags-backfill.ts`
- Create: `apps/backend/src/database/migrations/20260922000001-fleet-required-flags-backfill.spec.ts`
- Modify: `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts` (`create()`)
- Modify: `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.spec.ts`

**Frontend**
- Modify: `apps/frontend/src/features/fleet/types.ts` (add `CATEGORIES_WITH_REQUIRED`)
- Modify: `apps/frontend/src/features/fleet/components/MasterDataFormDialog.tsx`
- Modify: `apps/frontend/src/features/fleet/components/MasterDataFormDialog.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx` (column + `handleSubmit`)
- Modify: `apps/frontend/src/app/(dashboard)/fleet/master-data/page.spec.tsx`

## Two Traps Found While Planning

Read these before starting. Both will bite silently.

**Trap 1 — `handleSubmit` drops fields on edit.** `page.tsx:55-62` narrows the update payload to
exactly three columns:

```tsx
payload: { label: payload.label, sortOrder: payload.sortOrder, warnDays: payload.warnDays }
```

Adding the checkbox to the form is not enough. Without Task 5, ticking it and pressing Simpan on
an **existing** row appears to work and silently changes nothing. Creating works, editing does not.

**Trap 2 — two existing page tests assert exact column arrays.** `page.spec.tsx:244-251` and
`:283-289` compare `getAllByRole('columnheader').map(h => h.textContent)` against a literal list,
and the second one runs `it.each([... 'Jenis Berkas'])`. Adding a column to Jenis Berkas breaks
that shared case. Task 6 moves `Jenis Berkas` out of that list rather than loosening the assertion
— the exactness is what stops a stray column appearing unnoticed.

---

### Task 1: Migration backfills NULL to FALSE

**Files:**
- Create: `apps/backend/src/database/migrations/20260922000001-fleet-required-flags-backfill.ts`
- Test: `apps/backend/src/database/migrations/20260922000001-fleet-required-flags-backfill.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: class `FleetRequiredFlagsBackfill20260922000001` with `up(queryRunner)` and
  `down(queryRunner)`. No later task imports it; TypeORM finds it by directory glob.

- [ ] **Step 1: Write the failing test**

The pattern is copied from the neighbouring `20260912000003-fleet-doc-required-flags.spec.ts`: a
recording `QueryRunner` captures SQL so the policy is under test without a live database.

Create `apps/backend/src/database/migrations/20260922000001-fleet-required-flags-backfill.spec.ts`:

```ts
import { QueryRunner } from 'typeorm'
import { FleetRequiredFlagsBackfill20260922000001 } from './20260922000001-fleet-required-flags-backfill'

// Same recording-runner trick the 20260912000003 spec uses: the policy lives in SQL, so the SQL
// is what gets asserted. No database is involved.
const capture = async (dir: 'up' | 'down'): Promise<string[]> => {
  const queries: string[] = []
  const runner = {
    query: async (sql: string) => {
      queries.push(sql)
      return []
    },
  } as unknown as QueryRunner
  const migration = new FleetRequiredFlagsBackfill20260922000001()
  await (dir === 'up' ? migration.up(runner) : migration.down(runner))
  return queries
}

describe('FleetRequiredFlagsBackfill migration', () => {
  // FALSE, never TRUE. Backfilling TRUE would mark every unclassified file type mandatory and
  // turn the completeness chip red across the whole fleet in one deploy.
  it('writes FALSE', async () => {
    const [sql] = await capture('up')
    expect(sql).toMatch(/is_required\s*=\s*FALSE/i)
    expect(sql).not.toMatch(/is_required\s*=\s*TRUE/i)
  })

  // Rows already classified by 20260912000003 carry a deliberate TRUE/FALSE. Overwriting them
  // would silently undo that migration's policy.
  it('touches only the rows that are still NULL', async () => {
    const [sql] = await capture('up')
    expect(sql).toMatch(/is_required\s+IS\s+NULL/i)
  })

  // The other six categories never read is_required. Writing FALSE there would claim a policy
  // that does not exist for them.
  it('is scoped to the two categories that read the flag', async () => {
    const [sql] = await capture('up')
    expect(sql).toContain("'jenis_berkas'")
    expect(sql).toContain("'jenis_dokumen'")
    for (const other of ['pool', 'leasing', 'kepemilikan', 'jenis_armada', 'status_kendaraan', 'jenis_sim']) {
      expect(sql).not.toContain(`'${other}'`)
    }
  })

  it('restores NULL on the same two categories when rolled back', async () => {
    const [sql] = await capture('down')
    expect(sql).toMatch(/is_required\s*=\s*NULL/i)
    expect(sql).toContain("'jenis_berkas'")
    expect(sql).toContain("'jenis_dokumen'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  src/database/migrations/20260922000001-fleet-required-flags-backfill.spec.ts \
  >/tmp/mdreq-t1.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=1**; `tail -40 /tmp/mdreq-t1.log` shows `Cannot find module './20260922000001-fleet-required-flags-backfill'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/backend/src/database/migrations/20260922000001-fleet-required-flags-backfill.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// is_required is nullable with no default, so every row created through the Master Data form was
// born NULL. The service reads the flag as `isRequired: true`, which means NULL and FALSE are
// already indistinguishable to it — this backfill changes no behaviour, it only stops the column
// carrying two spellings of the same answer now that an operator can set it from the UI.
//
// Scoped to the two categories that actually read the flag. The other six would be claiming a
// policy that does not apply to them.
export class FleetRequiredFlagsBackfill20260922000001 implements MigrationInterface {
  name = 'FleetRequiredFlagsBackfill20260922000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fleet_master_data SET is_required = FALSE
      WHERE is_required IS NULL AND category IN ('jenis_berkas','jenis_dokumen')
    `)
  }

  // Deliberately not symmetric: this also nulls the rows 20260912000003 set to FALSE on purpose,
  // because nothing distinguishes those from the ones up() just wrote. Restoring them per code
  // would duplicate that migration's policy table here and leave two places to keep in step. The
  // same trade-off, for the same reason, is why 20260912000003's own down() resets to NULL.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fleet_master_data SET is_required = NULL
      WHERE is_required = FALSE AND category IN ('jenis_berkas','jenis_dokumen')
    `)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  src/database/migrations/20260922000001-fleet-required-flags-backfill.spec.ts \
  >/tmp/mdreq-t1b.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=0**, with `Test Suites: 1 passed` and `Tests: 4 passed` in the log.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/database/migrations/20260922000001-fleet-required-flags-backfill.ts apps/backend/src/database/migrations/20260922000001-fleet-required-flags-backfill.spec.ts
git commit -m "feat(fleet): backfill is_required NULL to FALSE where the flag is read

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Service defaults new rows to FALSE

**Files:**
- Modify: `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts:47-55`
- Test: `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `create()` keeps its signature `create(dto: CreateFleetMasterDataDto):
  Promise<FleetMasterDataEntity>`. Only the persisted default changes.

The current body saves the DTO as-is, so a row created without `isRequired` is born `NULL`. This
closes that at the API level rather than relying on the form to always send the field.

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.spec.ts`, inside the
top-level `describe('FleetMasterDataService', ...)` block. The existing `repo` mock defines
`create: jest.fn((v) => v)` and `save: jest.fn(async (v) => ({ id: 'new-id', ...v }))`, so
asserting on `repo.save` shows what would be persisted:

```ts
  describe('create defaults isRequired', () => {
    // A row born NULL can never be made required from the UI, and reads as "not required"
    // forever. The two categories that consult the flag get an explicit answer instead.
    it.each(['jenis_berkas', 'jenis_dokumen'])(
      'stores FALSE when %s omits the flag',
      async (category) => {
        await service.create({ category, code: 'x', label: 'X' } as never)
        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isRequired: false }))
      },
    )

    // Defaulting to true would make every new file type mandatory the moment it is created.
    it('never defaults to true', async () => {
      await service.create({ category: 'jenis_berkas', code: 'x', label: 'X' } as never)
      expect(repo.save).not.toHaveBeenCalledWith(expect.objectContaining({ isRequired: true }))
    })

    // An explicit choice is the caller's to make, including an explicit false.
    it('respects an explicit true', async () => {
      await service.create({
        category: 'jenis_berkas',
        code: 'x',
        label: 'X',
        isRequired: true,
      } as never)
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isRequired: true }))
    })

    // The other six categories never read the flag, so inventing a value for them would record a
    // policy that does not exist.
    it('leaves categories that do not use the flag alone', async () => {
      await service.create({ category: 'pool', code: 'x', label: 'X' } as never)
      expect(repo.save).toHaveBeenCalledWith(expect.not.objectContaining({ isRequired: false }))
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  src/modules/fleet-master-data/fleet-master-data.service.spec.ts \
  -t "create defaults isRequired" \
  >/tmp/mdreq-t2.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=1**; the log shows the first cases reporting `isRequired: undefined` where `false` was expected.

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts`, add the constant
just above the class declaration:

```ts
// The only two categories whose rows are ever consulted for is_required: jenis_berkas feeds the
// completeness chip's denominator, jenis_dokumen feeds the expiry-date validation on the vehicle
// form. Anywhere else the column is noise.
const CATEGORIES_WITH_REQUIRED = ['jenis_berkas', 'jenis_dokumen']
```

Then replace the body of `create()` (currently at lines 47-55):

```ts
  async create(dto: CreateFleetMasterDataDto): Promise<FleetMasterDataEntity> {
    await this.assertCodeFree(dto.category, dto.code)
    // A row born NULL reads as "not required" and can never be flipped from the UI, so the two
    // categories that consult the flag get an explicit FALSE rather than an absent answer. Set
    // here rather than in the form so a direct API call lands in the same state.
    const withDefault =
      dto.isRequired === undefined && CATEGORIES_WITH_REQUIRED.includes(dto.category)
        ? { ...dto, isRequired: false }
        : dto
    try {
      return await this.repo.save(this.repo.create(withDefault as Partial<FleetMasterDataEntity>))
    } catch (err: unknown) {
      this.throwIfCodeUniqueViolation(err, dto.category, dto.code)
      throw err
    }
  }
```

- [ ] **Step 4: Run the whole service suite**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB src/modules/fleet-master-data \
  >/tmp/mdreq-t2b.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=0**, including the pre-existing `create` tests — they pass a DTO without `isRequired`
for non-flag categories and must be unaffected.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts apps/backend/src/modules/fleet-master-data/fleet-master-data.service.spec.ts
git commit -m "feat(fleet): default is_required to false for the categories that read it

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Frontend category constant

**Files:**
- Modify: `apps/frontend/src/features/fleet/types.ts:28-31`

**Interfaces:**
- Consumes: existing `FleetMasterCategory` type.
- Produces: `CATEGORIES_WITH_REQUIRED: readonly FleetMasterCategory[]`, imported by Task 4
  (`MasterDataFormDialog.tsx`) and Task 6 (`page.tsx`).

No test of its own — it is a constant, exercised by Tasks 4 and 6. Committed with Task 4.

- [ ] **Step 1: Add the constant**

In `apps/frontend/src/features/fleet/types.ts`, directly below the existing
`CATEGORIES_WITH_WARN_DAYS` block (line 31):

```ts
// Mirrors the backend's own list. jenis_berkas drives the completeness chip's denominator and
// jenis_dokumen drives the expiry-date validation; the other six never read the flag, so offering
// the toggle there would be a control that does nothing.
export const CATEGORIES_WITH_REQUIRED: readonly FleetMasterCategory[] = [
  'jenis_berkas',
  'jenis_dokumen',
]
```

- [ ] **Step 2: Verify it typechecks**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec tsc --noEmit; echo "TSC_EXIT=$?"
```
Expected: **TSC_EXIT=0**.

---

### Task 4: Checkbox in the form dialog

**Files:**
- Modify: `apps/frontend/src/features/fleet/components/MasterDataFormDialog.tsx`
- Test: `apps/frontend/src/features/fleet/components/MasterDataFormDialog.spec.tsx`

**Interfaces:**
- Consumes: `CATEGORIES_WITH_REQUIRED` from Task 3; `FleetMasterPayload` (already has an optional
  `isRequired?: boolean | null`).
- Produces: the form now emits `isRequired: boolean` in its `onSubmit` payload for the two flag
  categories, and omits the key entirely for the other six. Task 6 relies on that payload key.

- [ ] **Step 1: Write the failing tests**

Add to `apps/frontend/src/features/fleet/components/MasterDataFormDialog.spec.tsx` inside the
existing `describe('MasterDataFormDialog', ...)`. Note `base` uses `category: 'leasing'`, so
category must be overridden per test:

```ts
  // The flag only means something where something reads it; a checkbox on a pool would invite an
  // admin to mark a row required and watch nothing happen.
  it.each(['jenis_berkas', 'jenis_dokumen'] as const)('shows the required toggle for %s', (category) => {
    render(<MasterDataFormDialog {...base} category={category} />)
    expect(screen.getByLabelText(/Wajib/)).toBeInTheDocument()
  })

  it.each(['pool', 'leasing', 'jenis_sim', 'jenis_armada'] as const)(
    'hides the required toggle for %s',
    (category) => {
      render(<MasterDataFormDialog {...base} category={category} />)
      expect(screen.queryByLabelText(/Wajib/)).not.toBeInTheDocument()
    },
  )

  // Turning a file type required re-reads the completeness chip for every vehicle at once. The
  // warning is the only place an operator is told that before it happens.
  it('warns that the chip is recalculated fleet-wide', () => {
    render(<MasterDataFormDialog {...base} category="jenis_berkas" />)
    expect(screen.getByText(/kelengkapan semua kendaraan/i)).toBeInTheDocument()
  })

  it('submits the ticked value', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(<MasterDataFormDialog {...base} category="jenis_berkas" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'Faktur' } })
    fireEvent.click(screen.getByLabelText(/Wajib/))
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ isRequired: true })),
    )
  })

  // Unticked must travel as an explicit false, not as an absent key: absent is how rows became
  // NULL in the first place.
  it('submits false when left unticked', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(<MasterDataFormDialog {...base} category="jenis_berkas" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'Faktur' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ isRequired: false })),
    )
  })

  // A category that does not read the flag must not have one invented for it.
  it('omits the flag entirely for categories that do not use it', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(<MasterDataFormDialog {...base} category="pool" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'Pool Bekasi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.not.objectContaining({ isRequired: expect.anything() })),
    )
  })

  it('reflects an existing required row when editing', () => {
    render(
      <MasterDataFormDialog
        {...base}
        category="jenis_berkas"
        initial={{
          id: 'r1',
          category: 'jenis_berkas',
          code: 'stnk',
          label: 'STNK',
          sortOrder: 10,
          isActive: true,
          warnDays: null,
          defaultValidMonths: null,
          isRequired: true,
        }}
      />,
    )
    expect(screen.getByLabelText(/Wajib/)).toBeChecked()
  })

  // Legacy rows predate the backfill. NULL reads as not required everywhere else, so the box must
  // agree rather than render indeterminate.
  it('treats a legacy null as unticked', () => {
    render(
      <MasterDataFormDialog
        {...base}
        category="jenis_berkas"
        initial={{
          id: 'r1',
          category: 'jenis_berkas',
          code: 'stnk',
          label: 'STNK',
          sortOrder: 10,
          isActive: true,
          warnDays: null,
          defaultValidMonths: null,
          isRequired: null,
        }}
      />,
    )
    expect(screen.getByLabelText(/Wajib/)).not.toBeChecked()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  src/features/fleet/components/MasterDataFormDialog.spec.tsx \
  >/tmp/mdreq-t4.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=1**; the log shows `Unable to find a label with the text of: /Wajib/`.

- [ ] **Step 3: Write the implementation**

In `apps/frontend/src/features/fleet/components/MasterDataFormDialog.tsx`:

**3a.** Add `CATEGORIES_WITH_REQUIRED` to the existing import from `'../types'` (line 16 block):

```tsx
import {
  CATEGORIES_WITH_REQUIRED,
  CATEGORIES_WITH_WARN_DAYS,
  FLEET_CATEGORY_LABELS,
  FleetMasterCategory,
  FleetMasterPayload,
  FleetMasterRow,
} from '../types'
```

**3b.** Add state beside the existing `warnDays` state (after line 50). `?? false` is what turns a
legacy `NULL` into an unticked box:

```tsx
  const [isRequired, setIsRequired] = useState(initial?.isRequired ?? false)
```

**3c.** Add the flag beside `showWarnDays` (line 56):

```tsx
  const showRequired = CATEGORIES_WITH_REQUIRED.includes(category)
```

**3d.** Extend the `onSubmit` payload (the object at lines 73-79). The spread keeps the key absent
for the six categories that do not read it:

```tsx
      await onSubmit({
        category,
        code,
        label: label.trim(),
        sortOrder: Number(sortOrder) || 0,
        warnDays: showWarnDays && warnDays !== '' ? Number(warnDays) : null,
        ...(showRequired ? { isRequired } : {}),
      })
```

**3e.** Add the control immediately after the closing `)}` of the `showWarnDays` block and before
the `{error && (` block. A native checkbox matches `VehicleFilters.tsx:131-139`; there is no
`Switch` in `components/ui/` and this does not need one:

```tsx
          {showRequired && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor="md-required">
                <input
                  id="md-required"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                />
                Wajib
              </label>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Mengubah ini menghitung ulang chip kelengkapan semua kendaraan.
              </p>
            </div>
          )}
```

- [ ] **Step 4: Run the suite**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  src/features/fleet/components/MasterDataFormDialog.spec.tsx \
  >/tmp/mdreq-t4b.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=0** and `Test Suites: 1 passed`, all tests including the pre-existing ones.

- [ ] **Step 5: Commit** (includes Task 3's constant)

```bash
git add apps/frontend/src/features/fleet/types.ts apps/frontend/src/features/fleet/components/MasterDataFormDialog.tsx apps/frontend/src/features/fleet/components/MasterDataFormDialog.spec.tsx
git commit -m "feat(fleet): add the wajib toggle to the master data form

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Carry isRequired through the edit path

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx:55-62`
- Test: `apps/frontend/src/app/(dashboard)/fleet/master-data/page.spec.tsx`

**Interfaces:**
- Consumes: the `isRequired` key Task 4 added to the submitted payload.
- Produces: `handleSubmit` forwards `isRequired` on update. Task 6 does not depend on it.

This is Trap 1. `handleSubmit` narrows an edit to three columns, so without this the checkbox
works when creating and silently does nothing when editing.

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/app/(dashboard)/fleet/master-data/page.spec.tsx` inside the top-level
describe. `mockUpdateAsync` is the existing mock behind `updateRow.mutateAsync`:

```tsx
  // handleSubmit narrows an edit to a fixed set of columns, so a field added to the form but not
  // to that list is accepted by the dialog and dropped on the way out — the row saves, nothing
  // changes, and no error is raised anywhere.
  it('forwards the required flag when editing', async () => {
    mockUseFleetMasterData.mockReturnValue({
      data: [{ ...row, category: 'jenis_berkas', code: 'stnk', label: 'STNK', isRequired: false }],
      isLoading: false,
    })
    render(<FleetMasterDataPage />)
    fireEvent.click(screen.getByRole('tab', { name: 'Jenis Berkas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ubah' }))
    fireEvent.click(screen.getByLabelText(/Wajib/))
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(mockUpdateAsync).toHaveBeenCalledWith({
        id: 'r1',
        payload: expect.objectContaining({ isRequired: true }),
      }),
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  "fleet/master-data/page.spec" -t "forwards the required flag" \
  >/tmp/mdreq-t5.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=1**; the log shows the payload holding only `label`, `sortOrder` and `warnDays`.

- [ ] **Step 3: Write the implementation**

In `apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx`, extend the update payload
(lines 55-62):

```tsx
      await updateRow.mutateAsync({
        id: modal.row.id,
        payload: {
          label: payload.label,
          sortOrder: payload.sortOrder,
          warnDays: payload.warnDays,
          // The dialog omits this key for the six categories that do not read the flag, so
          // spreading rather than assigning keeps those updates exactly as they were.
          ...(payload.isRequired !== undefined ? { isRequired: payload.isRequired } : {}),
        },
      })
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  "fleet/master-data/page.spec" -t "forwards the required flag" \
  >/tmp/mdreq-t5b.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=0**.

- [ ] **Step 5: Commit**

```bash
git add "apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx" "apps/frontend/src/app/(dashboard)/fleet/master-data/page.spec.tsx"
git commit -m "fix(fleet): stop dropping is_required on a master data edit

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: "Wajib" column in the table

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx:51, 116-130`
- Test: `apps/frontend/src/app/(dashboard)/fleet/master-data/page.spec.tsx:244-251, 271-290`

**Interfaces:**
- Consumes: `CATEGORIES_WITH_REQUIRED` from Task 3.
- Produces: nothing later tasks use.

This is Trap 2. Two existing tests pin the exact column list, and one of them includes
`Jenis Berkas` in an `it.each`. Fix those rather than loosening them — the exact comparison is
what catches a column appearing where it should not.

- [ ] **Step 1: Write the failing tests and repair the existing ones**

**1a.** In `page.spec.tsx`, the `it.each` at line 277 (`hides the threshold column on %s`) lists
`'Jenis Berkas'`. Remove that one entry — its column list is about to differ from the others:

```tsx
  it.each(['Jenis Armada', 'Kepemilikan', 'Leasing', 'Status Kendaraan', 'Pool'])(
```

**1b.** The `Jenis Dokumen` exact-array test near line 244 gains the new column. `Jenis Dokumen`
carries both `warnDays` and `isRequired`, so its header row is:

```tsx
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Label',
      'Kode',
      'Urutan',
      'Ambang (hari)',
      'Wajib',
      '',
    ])
```

**1c.** Add the new cases:

```tsx
  // Jenis Berkas is the one category with the required column but no threshold column, so its
  // header row is the proof that the two conditionals are independent.
  it('shows the required column without the threshold column on Jenis Berkas', () => {
    render(<FleetMasterDataPage />)
    fireEvent.click(screen.getByRole('tab', { name: 'Jenis Berkas' }))
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Label',
      'Kode',
      'Urutan',
      'Wajib',
      '',
    ])
  })

  it.each(['Jenis Armada', 'Kepemilikan', 'Leasing', 'Status Kendaraan', 'Pool', 'Jenis SIM'])(
    'hides the required column on %s',
    (tab) => {
      render(<FleetMasterDataPage />)
      fireEvent.click(screen.getByRole('tab', { name: tab }))
      expect(screen.queryByRole('columnheader', { name: 'Wajib' })).not.toBeInTheDocument()
    },
  )

  // A tick and an em dash, matching how the threshold column distinguishes a real value from an
  // absent one.
  it('renders a tick for a required row and a dash otherwise', () => {
    mockUseFleetMasterData.mockReturnValue({
      data: [
        { ...row, id: 'r1', category: 'jenis_berkas', code: 'stnk', label: 'STNK', isRequired: true },
        { ...row, id: 'r2', category: 'jenis_berkas', code: 'foto', label: 'Foto', isRequired: false },
      ],
      isLoading: false,
    })
    render(<FleetMasterDataPage />)
    fireEvent.click(screen.getByRole('tab', { name: 'Jenis Berkas' }))
    expect(within(screen.getAllByRole('row')[1]).getAllByRole('cell')[3].textContent).toBe('✓')
    expect(within(screen.getAllByRole('row')[2]).getAllByRole('cell')[3].textContent).toBe('—')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB "fleet/master-data/page.spec" \
  >/tmp/mdreq-t6.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=1**; the log shows the new cases reporting the `Wajib` header missing.

- [ ] **Step 3: Write the implementation**

**3a.** Add `CATEGORIES_WITH_REQUIRED` to the existing `'@/features/fleet/types'` import.

**3b.** Add beside `showWarnDays` (line 51):

```tsx
  const showRequired = CATEGORIES_WITH_REQUIRED.includes(category)
```

**3c.** Add the column directly after the existing conditional `Ambang (hari)` column (the
`...(showWarnDays ? [...] : [])` spread at lines 128-130) and before the trailing actions column:

```tsx
          ...(showRequired
            ? [
                {
                  header: 'Wajib',
                  accessor: (r: FleetMasterRow) => (r.isRequired === true ? '✓' : '—'),
                },
              ]
            : []),
```

- [ ] **Step 4: Run the full page suite**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB "fleet/master-data/page.spec" \
  >/tmp/mdreq-t6b.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=0** and `Test Suites: 1 passed`, including the two repaired tests.

- [ ] **Step 5: Commit**

```bash
git add "apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx" "apps/frontend/src/app/(dashboard)/fleet/master-data/page.spec.tsx"
git commit -m "feat(fleet): show the wajib column on the master data table

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full verification

**Files:** none modified unless a regression surfaces.

**Interfaces:**
- Consumes: every preceding task.
- Produces: evidence the feature is complete.

- [ ] **Step 1: Full frontend suite**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  >/tmp/mdreq-final-fe.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=0**. The fleet vehicle and driver suites read `isRequired`; a break there means a
fixture disagrees with the new default.

- [ ] **Step 2: Backend fleet and master data suites**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  src/modules/fleet-master-data src/modules/fleet-vehicles src/database/migrations \
  >/tmp/mdreq-final-be.log 2>&1; echo "EXIT=$?"
```
Expected: **EXIT=0**.

- [ ] **Step 3: Typecheck both sides**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm exec tsc --noEmit; echo "BE_TSC=$?"
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec tsc --noEmit; echo "FE_TSC=$?"
```
Expected: **BE_TSC=0** and **FE_TSC=0**.

- [ ] **Step 4: Confirm the migration runs**

Run:
```bash
cd /home/faris/code/esp/esp-dashboard && pnpm migration:run; echo "EXIT=$?"
```
Expected: `FleetRequiredFlagsBackfill20260922000001` reported as executed. (`migration:run` is
defined in `apps/backend/package.json:17`.)

- [ ] **Step 5: Verify against the database**

`DATABASE_URL` in `apps/backend/.env` is `postgres://postgres:postgres@localhost:5432/app`, so
psql runs against localhost rather than inside a container:

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d app -c \
  "SELECT category, is_required, COUNT(*) FROM fleet_master_data GROUP BY 1,2 ORDER BY 1,2;"
```

Expected: no `jenis_berkas` or `jenis_dokumen` row has a NULL `is_required`; the other six
categories still do. If `psql` is not installed on the host, run the same query through the
postgres container instead:
`docker exec -i ticketing-postgres psql -U postgres -d app -c "..."`.

- [ ] **Step 6: Report**

State the actual counts from Steps 1-2 and the table from Step 5. Do not claim success without
that output — see `superpowers:verification-before-completion`.

---

## Definition of Done

- [ ] Operators can tick "Wajib" on `jenis_berkas` and `jenis_dokumen`, and only those.
- [ ] The toggle persists on both create and edit.
- [ ] New rows in those categories are `FALSE`, never `NULL`, whether created from the form or the API.
- [ ] Existing `NULL`s in those two categories are `FALSE`; the other six are untouched.
- [ ] The table shows a "Wajib" column for those two categories only.
- [ ] The form warns that the change recalculates the completeness chip fleet-wide.
- [ ] Full frontend suite and the backend fleet/master-data/migration suites pass.
