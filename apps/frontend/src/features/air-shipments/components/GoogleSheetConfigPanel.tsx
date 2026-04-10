'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/shared/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'

// interface SheetConfig {
//   id?: string
//   sheetName: string
//   tableName: string
//   headerRow: number
//   uniqueKey: string[]
//   skipNullCols: boolean
// }

interface GoogleSheetConfig {
  id?: string
  sheetLink: string
  syncInterval: number
  enabled: boolean
  // sheetConfigs: SheetConfig[]
}

export function GoogleSheetConfigPanel() {
  // const [config, setConfig] = useState<GoogleSheetConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<GoogleSheetConfig>({
    sheetLink: '',
    syncInterval: 15,
    enabled: false,
    // sheetConfigs: [],
  } as GoogleSheetConfig)

  useEffect(() => {
    apiClient
      .get('/air-shipments/google-sheet-config')
      .then((res) =>
        setForm({
          id: res.data.id,
          sheetLink: res.data.sheetLink,
          syncInterval: res.data.syncInterval,
          enabled: res.data.enabled,
          // sheetConfigs: res.data.sheetConfigs.map((c: SheetConfig) => ({
          //   sheetName: c.sheetName,
          //   tableName: c.tableName,
          //   headerRow: c.headerRow,
          //   uniqueKey: Array.isArray(c.uniqueKey) ? c.uniqueKey : JSON.parse(c.uniqueKey),
          //   skipNullCols: c.skipNullCols,
          // })),
        })
      )
      .catch(() => setForm({} as GoogleSheetConfig)) // set empty form if no config found or error occurs
      .finally(() => setLoading(false))
  }, [])

  const handleEdit = () => {
    // setForm(config || ({} as GoogleSheetConfig))
    setEditMode(true)
  }

  const handleCancel = () => {
    setEditMode(false)
    // setForm({} as GoogleSheetConfig)
  }

  const handleChange = (field: keyof GoogleSheetConfig, value: string | number | boolean) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  // const handleSheetConfigChange = (
  //   idx: number,
  //   field: keyof SheetConfig,
  //   value: string | number | boolean | string[]
  // ) => {
  //   setForm((prev) => {
  //     if (!prev) return prev
  //     const sheetConfigs = [...prev.sheetConfigs]
  //     sheetConfigs[idx] = { ...sheetConfigs[idx], [field]: value }
  //     return { ...prev, sheetConfigs }
  //   })
  // }

  // const handleAddSheet = () => {
  //   setForm((prev) =>
  //     prev
  //       ? {
  //           ...prev,
  //           sheetConfigs: [
  //             ...(prev.sheetConfigs || []),
  //             { sheetName: '', tableName: '', headerRow: 1, uniqueKey: [''], skipNullCols: true },
  //           ],
  //         }
  //       : prev
  //   )
  // }

  // const handleRemoveSheet = (idx: number) => {
  //   setForm((prev) => {
  //     if (!prev) return prev
  //     const sheetConfigs = prev.sheetConfigs.filter((_, i) => i !== idx)
  //     return { ...prev, sheetConfigs }
  //   })
  // }

  const handleSave = async () => {
    if (!form) return
    setLoading(true)
    setError(null)
    let endpoint: string
    let method: 'post' | 'put' // using POST for both create and update for simplicity
    try {
      if (form.id) {
        endpoint = `/air-shipments/google-sheet-config/${form.id}`
        method = 'put'
        delete form.id // remove id from payload for update
      } else {
        endpoint = '/air-shipments/google-sheet-config'
        method = 'post'
      }
      await apiClient[method](endpoint, form)
      const res = await apiClient.get('/air-shipments/google-sheet-config')
      setEditMode(false)
      setForm({
        id: res.data.id,
        sheetLink: res.data.sheetLink,
        syncInterval: res.data.syncInterval,
        enabled: res.data.enabled,
        // sheetConfigs: res.data.sheetConfigs.map((c: SheetConfig) => ({
        //   sheetName: c.sheetName,
        //   tableName: c.tableName,
        //   headerRow: c.headerRow,
        //   uniqueKey: Array.isArray(c.uniqueKey) ? c.uniqueKey : JSON.parse(c.uniqueKey),
        //   skipNullCols: c.skipNullCols,
        // })),
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message || 'Failed to save config')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div>Loading...</div>
  if (error) return <div className="text-red-500">{error}</div>

  return (
    <div>
      <h2 className="text-lg font-medium mb-5">Google Sheet Integration Config</h2>
      <div className="space-y-4">
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
        {/* <div>
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
                    value={sheet.uniqueKey.join(',')}
                    onChange={(e) =>
                      handleSheetConfigChange(
                        idx,
                        'uniqueKey',
                        e.target.value.split(',').map((s) => s.trim())
                      )
                    }
                    disabled={!editMode}
                  />
                </FormField>
                <FormField label="Skip Null Cols">
                  <input type="checkbox" checked={sheet.skipNullCols} disabled />
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
        </div> */}
        {editMode ? (
          <div className="flex gap-2 mt-4">
            <Button onClick={handleSave} disabled={!editMode}>
              Save
            </Button>
            <Button variant="outline" onClick={handleCancel} disabled={!editMode}>
              Cancel
            </Button>
          </div>
        ) : (
          <div>
            <Button onClick={handleEdit}>Edit Config</Button>
          </div>
        )}
      </div>
    </div>
  )
}
