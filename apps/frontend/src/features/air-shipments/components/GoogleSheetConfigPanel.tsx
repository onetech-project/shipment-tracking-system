'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/shared/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { InfoTooltip } from '@/components/shared/info-tooltip'
import { normalizeTableName } from '../utils/normalizeTableName'
import { GoogleSheetConfig, SheetConfig } from '../types'
import Spinner from '@/components/ui/spinner'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { AlertTriangle, Info } from 'lucide-react'
import moment from 'moment'

const SYNC_SERVICE_ACCOUNT_EMAIL = 'esp-dashboard@fluted-arch-489408-b1.iam.gserviceaccount.com'

export function GoogleSheetConfigPanel() {
  // const [config, setConfig] = useState<GoogleSheetConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [configs, setConfigs] = useState<GoogleSheetConfig[]>([])
  const [form, setForm] = useState<GoogleSheetConfig>({} as GoogleSheetConfig)
  const [deleteTarget, setDeleteTarget] = useState<GoogleSheetConfig | null>(null)

  useEffect(() => {
    apiClient
      .get('/air-shipments/google-sheet-config')
      .then((res) => setConfigs(res.data))
      .catch(() => setForm({} as GoogleSheetConfig)) // set empty form if no config found or error occurs
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = () => {
    setForm({} as GoogleSheetConfig)
    setEditMode(true)
  }

  const handleEdit = (config: GoogleSheetConfig) => {
    setForm(config || ({} as GoogleSheetConfig))
    setEditMode(true)
  }

  const handleCancel = () => {
    setEditMode(false)
    setForm({} as GoogleSheetConfig)
  }

  const handleDelete = async () => {
    if (!deleteTarget?.id) return
    setError(null)
    try {
      await apiClient.delete(`/air-shipments/google-sheet-config/${deleteTarget.id}`)
      const res = await apiClient.get('/air-shipments/google-sheet-config')
      setConfigs(res.data)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message || 'Failed to delete config')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleChange = (field: keyof GoogleSheetConfig, value: string | number | boolean) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleSheetConfigChange = (idx: number, field: keyof SheetConfig, value: unknown) => {
    setForm((prev) => {
      if (!prev) return prev
      const sheetConfigs = [...(prev.sheetConfigs || [])]
      const existing: Partial<SheetConfig> = { ...(sheetConfigs[idx] || {}) }

      // Explicit per-field handling to satisfy TypeScript without `any`
      switch (field) {
        case 'sheetName':
          if (typeof value === 'string') {
            const newTable = normalizeTableName(value)
            existing.tableName = newTable
            existing.sheetName = value
          }
          break

        case 'uniqueKey':
          if (Array.isArray(value)) {
            existing.uniqueKey = value as string[]
          } else if (typeof value === 'string') {
            existing.uniqueKey = value.split(',').map((s) => s.trim())
          }
          break

        case 'tableName':
          if (typeof value === 'string') {
            existing.tableName = value
          }
          break

        case 'headerRow':
          if (typeof value === 'number') {
            existing.headerRow = value
          } else if (typeof value === 'string' && value.trim() !== '') {
            const n = Number(value)
            if (!Number.isNaN(n)) existing.headerRow = n
          }
          break

        case 'skipNullCols':
          if (typeof value === 'boolean') existing.skipNullCols = value
          break

        case 'id':
          if (typeof value === 'string') existing.id = value
          break

        default:
          break
      }

      sheetConfigs[idx] = existing as SheetConfig
      return { ...prev, sheetConfigs }
    })
  }

  const handleAddSheet = () => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            sheetConfigs: [
              ...(prev.sheetConfigs || []),
              { sheetName: '', tableName: '', headerRow: 1, uniqueKey: [''], skipNullCols: true },
            ],
          }
        : prev
    )
  }

  const handleRemoveSheet = (idx: number) => {
    setForm((prev) => {
      if (!prev) return prev
      const sheetConfigs = (prev.sheetConfigs || []).filter((_, i) => i !== idx)
      return { ...prev, sheetConfigs }
    })
  }

  const sheetConfigs = form?.sheetConfigs || []
  const hasSheetConfigs = sheetConfigs.length > 0

  const isSheetConfigComplete = (s: SheetConfig) => {
    const uniqueKeys = Array.isArray(s.uniqueKey)
      ? s.uniqueKey
      : String(s.uniqueKey || '').split(',')
    return (
      !!s.sheetName?.trim() &&
      !!s.tableName?.trim() &&
      typeof s.headerRow === 'number' &&
      !Number.isNaN(s.headerRow) &&
      s.headerRow > 0 &&
      uniqueKeys.some((k) => !!k?.trim())
    )
  }

  const allSheetConfigsComplete = hasSheetConfigs && sheetConfigs.every(isSheetConfigComplete)

  const handleSave = async () => {
    if (!form) return
    if (!hasSheetConfigs) {
      setError('Add at least one sheet config before saving.')
      return
    }
    if (!allSheetConfigsComplete) {
      setError('Fill in all sheet config fields (Sheet Name, Header Row, Unique Key) before saving.')
      return
    }
    setLoading(true)
    setError(null)
    let endpoint: string
    let method: 'post' | 'put'
    try {
      const payload: GoogleSheetConfig = {
        label: form.label,
        sheetLink: form.sheetLink,
        syncInterval: form.syncInterval,
        enabled: form.enabled,
        sheetConfigs: (form.sheetConfigs || []).map((s: SheetConfig) => ({
          sheetName: s.sheetName,
          tableName: s.tableName,
          headerRow: s.headerRow,
          uniqueKey: Array.isArray(s.uniqueKey)
            ? s.uniqueKey
            : String(s.uniqueKey || '')
                .split(',')
                .map((x: string) => x.trim()),
          skipNullCols: s.skipNullCols,
        })),
      }

      if (form.id) {
        endpoint = `/air-shipments/google-sheet-config/${form.id}`
        method = 'put'
      } else {
        endpoint = '/air-shipments/google-sheet-config'
        method = 'post'
      }

      await apiClient[method](endpoint, payload)
      const res = await apiClient.get('/air-shipments/google-sheet-config')
      setConfigs(res.data)
      setEditMode(false)
      setForm({} as GoogleSheetConfig)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message || 'Failed to save config')
    } finally {
      setLoading(false)
    }
  }

  if (loading)
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner size="h-12 w-12" ariaLabel="Loading Google Sheet Configs" />
      </div>
    )
  if (error) return <div className="text-red-500">{error}</div>

  return (
    <div>
      <div className="mb-6">
        <div className="flex justify-between mb-3">
          <h2 className="text-lg font-medium mb-2">Google Sheet Configs</h2>
          {!editMode && <Button onClick={handleAdd}>+ Add Config</Button>}
        </div>
        {configs.length === 0 && !editMode && (
          <div className="text-muted-foreground">No Google Sheet configs found.</div>
        )}
        {configs.length > 0 &&
          !editMode &&
          configs.map((cfg) => (
            <div
              key={cfg.id}
              className="border rounded p-3 mb-2 flex justify-between items-center bg-muted/30"
            >
              <div>
                <div className="font-semibold">{cfg.label || 'No Label'}</div>
                <div className="text-sm text-muted-foreground">Link: {cfg.sheetLink}</div>
                <div className="text-sm text-muted-foreground">
                  Sync Interval: {cfg.syncInterval} seconds
                </div>
                <div className="text-sm text-muted-foreground">
                  Status: {cfg.enabled ? 'Enabled' : 'Disabled'}
                </div>
                {cfg.updatedAt && (
                  <div className="text-sm text-muted-foreground">
                    Last Updated: {moment(cfg.updatedAt).fromNow()} (
                    {moment(cfg.updatedAt).format('DD-MMM-YYYY HH:mm:ss')})
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleEdit(cfg)}>Edit</Button>
                <Button variant="destructive" onClick={() => setDeleteTarget(cfg)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
      </div>
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Google Sheet Config"
        description={`Are you sure you want to delete "${deleteTarget?.label || 'this config'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
      {editMode && form && (
        <>
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
              <div className="flex items-start gap-2">
                <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="mb-1 font-medium">Before syncing, share your Google Sheet</p>
                  <p>
                    Invite{' '}
                    <code className="rounded bg-blue-100 px-1 py-0.5 font-mono text-xs dark:bg-blue-900/50">
                      {SYNC_SERVICE_ACCOUNT_EMAIL}
                    </code>{' '}
                    as a <strong>Viewer (read permission)</strong> on the Google Sheet you want to
                    sync, otherwise the sync will fail.
                  </p>
                </div>
              </div>
            </div>
            <FormField
              label="Label"
              required
              labelExtra={
                <InfoTooltip text="A friendly name to identify this Google Sheet configuration in the list." />
              }
            >
              <Input
                value={form?.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                disabled={!editMode}
              />
            </FormField>
            <FormField
              label="Google Sheet Link"
              required
              labelExtra={
                <InfoTooltip text="The full URL of the Google Sheet to sync. Make sure the service account above is invited as a Viewer." />
              }
            >
              <Input
                value={form?.sheetLink || ''}
                onChange={(e) => handleChange('sheetLink', e.target.value)}
                disabled={!editMode}
              />
            </FormField>
            <FormField
              label="Sync Interval (seconds)"
              required
              labelExtra={
                <InfoTooltip text="How often the system re-reads the sheet and syncs its data. Minimum 15 seconds." />
              }
            >
              <Input
                type="number"
                value={form?.syncInterval}
                onChange={(e) => handleChange('syncInterval', Number(e.target.value))}
                disabled={!editMode}
                min={15}
              />
            </FormField>
            <FormField
              label="Enable Google Sheet Sync"
              className="flex-row"
              labelExtra={
                <InfoTooltip text="Turn syncing on or off for this configuration without deleting it." />
              }
            >
              <input
                type="checkbox"
                checked={form?.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
                disabled={!editMode}
              />
            </FormField>
            <div>
              <div className="flex flex-col">
                <span className="font-semibold">Sheet Configs</span>
              </div>
              {editMode && !allSheetConfigsComplete && (
                <div className="my-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle size={14} className="shrink-0" />
                  {!hasSheetConfigs
                    ? 'Add at least one sheet config before saving.'
                    : 'Fill in all sheet config fields (Sheet Name, Header Row, Unique Key) before saving.'}
                </div>
              )}
              {form?.sheetConfigs?.map((sheet, idx) => (
                <div key={idx} className="border rounded p-3 mb-2 space-y-2 bg-muted/30">
                  <div className="flex gap-2">
                    <FormField
                      label="Sheet Name"
                      required
                      labelExtra={
                        <InfoTooltip text="The exact name of the tab/worksheet inside the Google Sheet to read rows from." />
                      }
                    >
                      <Input
                        value={sheet.sheetName}
                        onChange={(e) => handleSheetConfigChange(idx, 'sheetName', e.target.value)}
                        disabled={!editMode}
                      />
                    </FormField>
                    <FormField
                      label="Table Name"
                      required
                      labelExtra={
                        <InfoTooltip text="Auto-generated from the sheet name. This is the database table where the sheet's rows are stored." />
                      }
                    >
                      <Input
                        value={sheet.tableName}
                        onChange={(e) => handleSheetConfigChange(idx, 'tableName', e.target.value)}
                        disabled
                      />
                    </FormField>
                    <FormField
                      label="Header Row"
                      required
                      labelExtra={
                        <InfoTooltip text="The row number that contains the column headers. Rows below it are treated as data." />
                      }
                    >
                      <Input
                        type="number"
                        value={sheet.headerRow}
                        onChange={(e) =>
                          handleSheetConfigChange(idx, 'headerRow', Number(e.target.value))
                        }
                        disabled={!editMode}
                      />
                    </FormField>
                    <FormField
                      label="Unique Key (comma separated)"
                      required
                      labelExtra={
                        <InfoTooltip text="Column(s) that uniquely identify each row, used by the sync to update existing records instead of creating duplicates. Enter the Postgres column name format — lowercase snake_case (spaces and symbols become underscores), not the original sheet header. Example: a sheet header 'AWB Number' becomes awb_number. For a composite key, comma-separate: awb_number,flight_date" />
                      }
                    >
                      <Input
                        value={sheet.uniqueKey?.join(',') || ''}
                        onChange={(e) => handleSheetConfigChange(idx, 'uniqueKey', e.target.value)}
                        disabled={!editMode}
                      />
                    </FormField>
                    {/* <FormField label="Skip Null Cols">
                      <input
                        type="checkbox"
                        checked={!!sheet.skipNullCols}
                        onChange={(e) =>
                          handleSheetConfigChange(idx, 'skipNullCols', e.target.checked)
                        }
                        disabled={!editMode}
                      />
                    </FormField> */}
                    <Button
                      className="ms-auto my-auto"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveSheet(idx)}
                      disabled={!editMode}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex flex-col">
                <Button variant="outline" size="sm" onClick={handleAddSheet} disabled={!editMode}>
                  + Add Sheet
                </Button>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSave} disabled={!editMode || !allSheetConfigsComplete}>
                Save
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={!editMode}>
                Cancel
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
