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

// What the fake server currently holds, per scenario id. A gate holds that scenario's GET open until
// the test resolves it, so the order "save resolves, then the picked detail lands" is deterministic.
type Stored = { name: string; revision: number; payload: unknown }
let servers: Record<string, Stored>
let gates: Partial<Record<string, Promise<void>>>
const get = apiClient.get as jest.Mock
const patch = apiClient.patch as jest.Mock
const post = apiClient.post as jest.Mock

const detailOf = (id: string, s: Stored) => ({ id, name: s.name, description: null, revision: s.revision, updatedAt: '2026-10-02T00:00:00Z', updatedBy: 'faris', payload: s.payload })
const deferred = <T,>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

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
  patch.mockReset()
  post.mockReset()
  loads = []
  servers = { s1: { name: 'Baseline', revision: 2, payload: payloadWithRate(111) } }
  gates = {}
  get.mockImplementation(async (url: string) => {
    if (url === '/route-simulation/scenarios') {
      return { data: Object.entries(servers).map(([id, s]) => { const { payload: _p, ...summary } = detailOf(id, s); return summary }) }
    }
    const id = url.match(/^\/route-simulation\/scenarios\/(\w+)$/)?.[1]
    if (id && servers[id]) {
      if (gates[id]) await gates[id]
      return { data: detailOf(id, servers[id]) }
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
  servers.s1 = { name: 'Baseline', revision: 3, payload: payloadWithRate(333) }
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
  servers.s1 = { name: 'Baseline', revision: 3, payload: payloadWithRate(333) }
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
    servers.s1 = { name: 'Baseline', revision: 3, payload: body.payload }
    return { data: { id: 's1', name: 'Baseline', description: null, revision: 3, updatedAt: '2026-10-04T00:00:00Z', updatedBy: 'faris', payload: body.payload } }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Skenario disimpan'))
  await settle()
  expect(rate()).toBe('999')
  expect(loads.length).toBe(before)
})

const select = () => screen.getByLabelText('Skenario') as HTMLSelectElement
const button = (name: string) => screen.getByRole('button', { name })

it('d) a pick made while Simpan is in flight loads that scenario once, and the late save does not clobber it', async () => {
  servers.s2 = { name: 'Kedua', revision: 5, payload: payloadWithRate(555) }
  renderBar()
  await pick('s1')
  await waitFor(() => expect(rate()).toBe('111'))
  await settle()
  fireEvent.click(button('edit-999'))

  const patchDone = deferred<{ data: unknown }>()
  patch.mockImplementationOnce(() => patchDone.promise)
  fireEvent.click(button('Simpan'))
  // (a) While the save is in flight, switching and every other write is locked.
  await waitFor(() => expect(select()).toBeDisabled())
  expect(button('Simpan')).toBeDisabled()
  expect(button('Simpan sebagai…')).toBeDisabled()
  expect(button('Hapus')).toBeDisabled()

  // (b) Defence in depth: fire the change straight at the (disabled) select. React still delivers
  // it to onChange, so pick() runs; the controlled value only reads 's2' if it did.
  const s2Get = deferred<void>()
  gates.s2 = s2Get.promise
  const before = loads.length
  fireEvent.change(select(), { target: { value: 's2' } })
  expect(select().value).toBe('s2')

  // The save of s1 resolves AFTER the user has moved to s2, and BEFORE s2's detail lands.
  await act(async () => {
    patchDone.resolve({ data: detailOf('s1', { name: 'Baseline', revision: 3, payload: payloadWithRate(999) }) })
  })
  await settle()
  await act(async () => s2Get.resolve())
  await waitFor(() => expect(rate()).toBe('555'))
  await settle()
  expect(rate()).toBe('555')
  expect(loads.length - before).toBe(1)
  expect(select().value).toBe('s2')

  // And the next save targets s2 at s2's own revision, not s1's.
  fireEvent.click(button('edit-999'))
  patch.mockResolvedValueOnce({ data: detailOf('s2', { name: 'Kedua', revision: 6, payload: payloadWithRate(999) }) })
  fireEvent.click(button('Simpan'))
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(2))
  expect(patch.mock.calls[1][0]).toBe('/route-simulation/scenarios/s2')
  expect(patch.mock.calls[1][1].revision).toBe(5)
})

it('e) Simpan sebagai keeps the working state: the new scenario is not loaded back over it', async () => {
  renderBar()
  await screen.findByRole('option', { name: 'Baseline' })
  fireEvent.click(button('edit-999'))
  jest.spyOn(window, 'prompt').mockReturnValue('Kedua')
  post.mockImplementationOnce(async () => {
    // The server's copy differs from the working state, so a reload would be visible.
    servers.s2 = { name: 'Kedua', revision: 1, payload: payloadWithRate(777) }
    return { data: detailOf('s2', servers.s2) }
  })
  fireEvent.click(button('Simpan sebagai…'))
  await waitFor(() => expect(onFlash).toHaveBeenCalledWith('Skenario "Kedua" disimpan'))
  await settle()
  expect(select().value).toBe('s2')
  expect(rate()).toBe('999')
  expect(loads).toHaveLength(0)
})

it('f) a pick made while Simpan sebagai is in flight wins over the late create', async () => {
  renderBar()
  await screen.findByRole('option', { name: 'Baseline' })
  fireEvent.click(button('edit-999'))
  jest.spyOn(window, 'prompt').mockReturnValue('Kedua')
  const postDone = deferred<{ data: unknown }>()
  post.mockImplementationOnce(() => postDone.promise)
  fireEvent.click(button('Simpan sebagai…'))
  await waitFor(() => expect(select()).toBeDisabled())

  const s1Get = deferred<void>()
  gates.s1 = s1Get.promise
  fireEvent.change(select(), { target: { value: 's1' } }) // bypasses the lock, as in d)
  expect(select().value).toBe('s1')

  servers.s2 = { name: 'Kedua', revision: 1, payload: payloadWithRate(777) }
  await act(async () => postDone.resolve({ data: detailOf('s2', servers.s2) }))
  await settle()
  await act(async () => s1Get.resolve())
  await waitFor(() => expect(rate()).toBe('111'))
  await settle()
  expect(select().value).toBe('s1')
  expect(loads).toHaveLength(1)
})
