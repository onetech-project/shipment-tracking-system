import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useQueryClient } from '@tanstack/react-query'
import { fixtureSource } from '../engine/__fixtures__/source'
import { toPayloadWithSource } from '../engine'
import { initReducer } from '../state/reducer'
import { ScenarioBar } from './ScenarioBar'
import * as hooks from '../hooks/useRouteSimulation'

jest.mock('../hooks/useRouteSimulation')
jest.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: jest.fn() }))

const create = jest.fn()
const update = jest.fn()
const remove = jest.fn()
const invalidateQueries = jest.fn()
const removeQueries = jest.fn()
const validPayload = () => toPayloadWithSource(fixtureSource(), initReducer(fixtureSource()).sim)
beforeEach(() => {
  jest.clearAllMocks()
  ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries, removeQueries })
  ;(hooks.useScenarios as jest.Mock).mockReturnValue({ data: [{ id: 's1', name: 'Baseline', description: null, revision: 2, updatedAt: '2026-10-02T00:00:00Z', updatedBy: 'faris' }] })
  ;(hooks.useScenario as jest.Mock).mockReturnValue({ data: undefined })
  ;(hooks.useCreateScenario as jest.Mock).mockReturnValue({ mutateAsync: create.mockResolvedValue({ id: 's2', revision: 1, name: 'Baru' }), isPending: false })
  ;(hooks.useUpdateScenario as jest.Mock).mockReturnValue({ mutateAsync: update, isPending: false })
  ;(hooks.useDeleteScenario as jest.Mock).mockReturnValue({ mutateAsync: remove.mockResolvedValue(undefined), isPending: false })
})

it('saves a new scenario with the full payload and marks the state clean', async () => {
  const dispatch = jest.fn()
  jest.spyOn(window, 'prompt').mockReturnValue('Baru')
  render(<ScenarioBar state={{ ...initReducer(fixtureSource()), dirty: true }} dispatch={dispatch} onFlash={jest.fn()} />)
  expect(screen.getByText('Belum disimpan')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Simpan sebagai…' }))
  await waitFor(() => expect(create).toHaveBeenCalled())
  expect(create.mock.calls[0][0]).toMatchObject({ name: 'Baru', payload: { version: 2, simStart: '2026-09-1H', horizonPeriods: 12 } })
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'markSaved' }))
})

it('reports a stale save without touching the cache, so the unsaved edits are not reloaded over', async () => {
  const onFlash = jest.fn()
  const dispatch = jest.fn()
  jest.spyOn(window, 'confirm').mockReturnValue(true) // switching away from a dirty state asks first
  update.mockRejectedValueOnce({ response: { status: 409, data: { message: 'stale' } } })
  ;(hooks.useScenario as jest.Mock).mockReturnValue({ data: { id: 's1', name: 'Baseline', revision: 2, payload: validPayload() }, isFetching: false })
  render(<ScenarioBar state={{ ...initReducer(fixtureSource()), dirty: true }} dispatch={dispatch} onFlash={onFlash} />)
  fireEvent.change(screen.getByLabelText('Skenario'), { target: { value: 's1' } })
  dispatch.mockClear()
  removeQueries.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(() =>
    expect(onFlash).toHaveBeenCalledWith(
      'Skenario ini sudah disimpan orang lain setelah kamu membukanya. Pilih "Baru" lalu buka skenario ini lagi untuk memuat versi terbaru, atau simpan sebagai skenario baru.',
    ),
  )
  expect(invalidateQueries).not.toHaveBeenCalled()
  expect(removeQueries).not.toHaveBeenCalled()
  expect(dispatch).not.toHaveBeenCalled()
})

it('drops the cached scenario detail when picking it, so a reopen never serves a stale revision', () => {
  render(<ScenarioBar state={{ ...initReducer(fixtureSource()), dirty: false }} dispatch={jest.fn()} onFlash={jest.fn()} />)
  fireEvent.change(screen.getByLabelText('Skenario'), { target: { value: 's1' } })
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['route-simulation', 'scenarios', 's1'], exact: true })
  expect(invalidateQueries).not.toHaveBeenCalled()
})

it('refuses to load a scenario whose payload is not recognised, and flashes instead of crashing', () => {
  const onFlash = jest.fn()
  const dispatch = jest.fn()
  ;(hooks.useScenario as jest.Mock).mockReturnValue({ data: { id: 's1', name: 'Baseline', revision: 2, payload: {} }, isFetching: false })
  render(<ScenarioBar state={{ ...initReducer(fixtureSource()), dirty: false }} dispatch={dispatch} onFlash={onFlash} />)
  fireEvent.change(screen.getByLabelText('Skenario'), { target: { value: 's1' } })
  expect(onFlash).toHaveBeenCalledWith('Skenario ini tidak bisa dibuka: format datanya tidak dikenal.')
  expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'load' }))
  // The refused scenario is deselected, so Simpan cannot write the unrelated working state into it.
  expect((screen.getByLabelText('Skenario') as HTMLSelectElement).value).toBe('')
  expect(screen.queryByRole('button', { name: 'Simpan' })).not.toBeInTheDocument()
})

it('disables Simpan while the picked scenario detail has not loaded yet', () => {
  ;(hooks.useScenario as jest.Mock).mockReturnValue({ data: undefined })
  render(<ScenarioBar state={{ ...initReducer(fixtureSource()), dirty: true }} dispatch={jest.fn()} onFlash={jest.fn()} />)
  fireEvent.change(screen.getByLabelText('Skenario'), { target: { value: 's1' } })
  expect(screen.getByRole('button', { name: 'Simpan' })).toBeDisabled()
})

it('saves an update to an already-open scenario', async () => {
  const onFlash = jest.fn()
  update.mockResolvedValueOnce({ id: 's1', revision: 3 })
  ;(hooks.useScenario as jest.Mock).mockReturnValue({ data: { id: 's1', name: 'Baseline', revision: 2, payload: validPayload() }, isFetching: false })
  render(<ScenarioBar state={{ ...initReducer(fixtureSource()), dirty: true }} dispatch={jest.fn()} onFlash={onFlash} />)
  fireEvent.change(screen.getByLabelText('Skenario'), { target: { value: 's1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({ id: 's1', body: expect.objectContaining({ revision: 2 }) }),
  )
  await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Skenario disimpan'))
})

it('deletes the open scenario and flashes confirmation on success', async () => {
  const onFlash = jest.fn()
  jest.spyOn(window, 'confirm').mockReturnValue(true)
  ;(hooks.useScenario as jest.Mock).mockReturnValue({ data: { id: 's1', name: 'Baseline', revision: 2, payload: validPayload() }, isFetching: false }) // Hapus waits for the detail
  render(<ScenarioBar state={{ ...initReducer(fixtureSource()), dirty: false }} dispatch={jest.fn()} onFlash={onFlash} />)
  fireEvent.change(screen.getByLabelText('Skenario'), { target: { value: 's1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Hapus' }))
  await waitFor(() => expect(remove).toHaveBeenCalledWith('s1'))
  await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Skenario dihapus'))
})

it('reports a failed delete without losing the current scenario selection', async () => {
  const onFlash = jest.fn()
  jest.spyOn(window, 'confirm').mockReturnValue(true)
  remove.mockRejectedValueOnce({ response: { data: { message: 'nope' } } })
  ;(hooks.useScenario as jest.Mock).mockReturnValue({ data: { id: 's1', name: 'Baseline', revision: 2, payload: validPayload() }, isFetching: false }) // Hapus waits for the detail
  render(<ScenarioBar state={{ ...initReducer(fixtureSource()), dirty: false }} dispatch={jest.fn()} onFlash={onFlash} />)
  fireEvent.change(screen.getByLabelText('Skenario'), { target: { value: 's1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Hapus' }))
  await waitFor(() => expect(onFlash).toHaveBeenCalledWith('nope'))
  expect((screen.getByLabelText('Skenario') as HTMLSelectElement).value).toBe('s1')
})
