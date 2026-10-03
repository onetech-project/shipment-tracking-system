import React, { useReducer } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { toPayloadWithSource } from '../engine'
import { fixtureSource } from '../engine/__fixtures__/source'
import { initReducer, SimAction, simReducer } from '../state/reducer'
import { ScenarioBar } from './ScenarioBar'

// Unlike ScenarioBar.spec.tsx, nothing from React Query or the hooks module is mocked here: these
// cases exercise the real invalidate/refetch/cache behaviour, which is where unsaved edits got lost.
jest.mock('@/shared/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}))
jest.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }))

const KEY = 'Jabo|Aceh'
const STALE_409 =
  'Skenario ini sudah disimpan orang lain setelah kamu membukanya. Pilih "Baru" lalu buka skenario ini lagi untuk memuat versi terbaru, atau simpan sebagai skenario baru.'
const src = fixtureSource()

// A scenario payload identical to a fresh state except for the Jabo|Aceh rate, so each load is
// observable through that single number.
const payloadWithRate = (rate: number) =>
  toPayloadWithSource(src, simReducer(initReducer(src), { type: 'rateSet', key: KEY, value: rate }).sim)

// What the fake server currently holds for scenario s1.
let server: { revision: number; payload: unknown }
const get = apiClient.get as jest.Mock
const patch = apiClient.patch as jest.Mock
const post = apiClient.post as jest.Mock

let loads: SimAction[]
const onFlash = jest.fn()

function Harness() {
  const [state, rawDispatch] = useReducer(simReducer, src, initReducer)
  const dispatch: React.Dispatch<SimAction> = (a) => {
    if (a.type === 'load') loads.push(a)
    rawDispatch(a)
  }
  const rate = state.sim.routes.find((r) => r.key === KEY)?.rateSpx
  return (
    <>
      <ScenarioBar state={state} dispatch={dispatch} onFlash={onFlash} />
      <span data-testid="rate">{rate}</span>
      <button onClick={() => dispatch({ type: 'rateSet', key: KEY, value: 999 })}>edit-999</button>
    </>
  )
}

function renderBar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
}

// Lets any pending fetch / React Query notification (scheduled on setTimeout 0) run to completion,
// so a refetch-driven `load` would have landed before the assertions that follow.
const settle = async () => {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  }
}

const rate = () => screen.getByTestId('rate').textContent
const pick = async (value: string) => {
  await screen.findByRole('option', { name: 'Baseline' })
  fireEvent.change(screen.getByLabelText('Skenario'), { target: { value } })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.restoreAllMocks()
  loads = []
  server = { revision: 2, payload: payloadWithRate(111) }
  get.mockImplementation(async (url: string) => {
    if (url === '/route-simulation/scenarios') {
      return { data: [{ id: 's1', name: 'Baseline', description: null, revision: server.revision, updatedAt: '2026-10-02T00:00:00Z', updatedBy: 'faris' }] }
    }
    if (url === '/route-simulation/scenarios/s1') {
      return { data: { id: 's1', name: 'Baseline', description: null, revision: server.revision, updatedAt: '2026-10-02T00:00:00Z', updatedBy: 'faris', payload: server.payload } }
    }
    throw new Error(`unexpected GET ${url}`)
  })
  jest.spyOn(window, 'confirm').mockReturnValue(true)
})

it('a) keeps unsaved edits across a 409, and Simpan sebagai still saves them', async () => {
  renderBar()
  await pick('s1')
  await waitFor(() => expect(rate()).toBe('111'))

  fireEvent.click(screen.getByRole('button', { name: 'edit-999' }))
  expect(rate()).toBe('999')

  // Someone else saved revision 3 meanwhile: our PATCH at revision 2 is refused.
  server = { revision: 3, payload: payloadWithRate(333) }
  patch.mockRejectedValueOnce({ response: { status: 409, data: { message: 'stale' } } })
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(() => expect(onFlash).toHaveBeenCalledWith(STALE_409))
  await settle()
  expect(rate()).toBe('999')

  jest.spyOn(window, 'prompt').mockReturnValue('Salinan')
  post.mockResolvedValueOnce({ data: { id: 's2', name: 'Salinan', description: null, revision: 1, updatedAt: '2026-10-04T00:00:00Z', updatedBy: 'faris', payload: payloadWithRate(999) } })
  fireEvent.click(screen.getByRole('button', { name: 'Simpan sebagai…' }))
  await waitFor(() => expect(post).toHaveBeenCalled())
  expect(post.mock.calls[0][1].payload.routeEdits[KEY].rateSpx).toBe(999)
  await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Skenario "Salinan" disimpan'))
  await settle()
  expect(rate()).toBe('999')
})

it('b) reopening a scenario after "Baru" loads the latest revision exactly once', async () => {
  renderBar()
  await pick('s1')
  await waitFor(() => expect(rate()).toBe('111'))
  await settle()

  await pick('')
  await settle()
  server = { revision: 3, payload: payloadWithRate(333) }
  const before = loads.length

  await pick('s1')
  await waitFor(() => expect(rate()).toBe('333'))
  await settle()
  expect(rate()).toBe('333')
  expect(loads.length - before).toBe(1)
})

it('c) a successful save does not reload the scenario over the working state', async () => {
  renderBar()
  await pick('s1')
  await waitFor(() => expect(rate()).toBe('111'))
  await settle()
  const before = loads.length

  fireEvent.click(screen.getByRole('button', { name: 'edit-999' }))
  patch.mockImplementationOnce(async (_url: string, body: { payload: unknown }) => {
    server = { revision: 3, payload: body.payload }
    return { data: { id: 's1', name: 'Baseline', description: null, revision: 3, updatedAt: '2026-10-04T00:00:00Z', updatedBy: 'faris', payload: body.payload } }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Skenario disimpan'))
  await settle()
  expect(rate()).toBe('999')
  expect(loads.length).toBe(before)
})
