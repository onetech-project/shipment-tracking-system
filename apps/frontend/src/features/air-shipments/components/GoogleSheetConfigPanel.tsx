'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/shared/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { normalizeTableName } from '../utils/normalizeTableName'
import { GoogleSheetConfig, SheetConfig } from '../types'
import Spinner from '@/components/ui/spinner'

export function GoogleSheetConfigPanel() {
  // const [config, setConfig] = useState<GoogleSheetConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [configs, setConfigs] = useState<GoogleSheetConfig[]>([])
  const [form, setForm] = useState<GoogleSheetConfig>({} as GoogleSheetConfig)

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
            if (
              !existing.tableName ||
              existing.tableName === normalizeTableName(existing.sheetName || '')
            ) {
              existing.tableName = newTable
            }
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

  const handleSave = async () => {
    if (!form) return
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
      {configs.length > 0 && !editMode && (
        <div className="mb-6">
          <div className="flex justify-between mb-3">
            <h2 className="text-lg font-medium mb-2">Google Sheet Configs</h2>
            <Button onClick={handleAdd}>+ Add Config</Button>
          </div>
          {configs.map((cfg) => (
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
              </div>
              <Button onClick={() => handleEdit(cfg)}>Edit</Button>
            </div>
          ))}
        </div>
      )}
      {editMode && form && (
        <>
          <h2 className="text-lg font-medium mb-5">Google Sheet Integration Config</h2>
          <div className="space-y-4">
            <FormField label="Label" required>
              <Input
                value={form?.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                disabled={!editMode}
              />
            </FormField>
            <FormField label="Google Sheet Link" required>
              <Input
                value={form?.sheetLink || ''}
                onChange={(e) => handleChange('sheetLink', e.target.value)}
                disabled={!editMode}
              />
            </FormField>
            <FormField label="Sync Interval (seconds)" required>
              <Input
                type="number"
                value={form?.syncInterval}
                onChange={(e) => handleChange('syncInterval', Number(e.target.value))}
                disabled={!editMode}
              />
            </FormField>
            <FormField label="Enable Google Sheet Sync" className="flex-row">
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
              {form?.sheetConfigs?.map((sheet, idx) => (
                <div key={idx} className="border rounded p-3 mb-2 space-y-2 bg-muted/30">
                  <div className="flex gap-2">
                    <FormField label="Sheet Name" required>
                      <Input
                        value={sheet.sheetName}
                        onChange={(e) => handleSheetConfigChange(idx, 'sheetName', e.target.value)}
                        disabled={!editMode}
                      />
                    </FormField>
                    <FormField label="Table Name" required>
                      <Input
                        value={sheet.tableName}
                        onChange={(e) => handleSheetConfigChange(idx, 'tableName', e.target.value)}
                        disabled={!editMode}
                      />
                    </FormField>
                    <FormField label="Header Row" required>
                      <Input
                        type="number"
                        value={sheet.headerRow}
                        onChange={(e) =>
                          handleSheetConfigChange(idx, 'headerRow', Number(e.target.value))
                        }
                        disabled={!editMode}
                      />
                    </FormField>
                    <FormField label="Unique Key (comma separated)" required>
                      <Input
                        value={sheet.uniqueKey?.join(',') || ''}
                        onChange={(e) => handleSheetConfigChange(idx, 'uniqueKey', e.target.value)}
                        disabled={!editMode}
                      />
                    </FormField>
                    <FormField label="Skip Null Cols">
                      <input
                        type="checkbox"
                        checked={!!sheet.skipNullCols}
                        onChange={(e) =>
                          handleSheetConfigChange(idx, 'skipNullCols', e.target.checked)
                        }
                        disabled={!editMode}
                      />
                    </FormField>
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
              <Button onClick={handleSave} disabled={!editMode}>
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
