import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  useCreateScenario,
  useDeleteScenario,
  useScenario,
  useScenarios,
  useSimulationSource,
  useUpdateScenario,
} from './useRouteSimulation'

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn(), useMutation: jest.fn(), useQueryClient: jest.fn() }))
jest.mock('@/shared/api/client', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
  },
}))

beforeEach(() => jest.clearAllMocks())
const lastQuery = () => (useQuery as jest.Mock).mock.calls.at(-1)[0]
const lastMutation = () => (useMutation as jest.Mock).mock.calls.at(-1)[0]

it('keys the source and scenarios under route-simulation', async () => {
  ;(useQuery as jest.Mock).mockReturnValue({})
  useSimulationSource(false)
  expect(lastQuery().queryKey).toEqual(['route-simulation', 'source'])
  expect(lastQuery().enabled).toBe(false)
  await lastQuery().queryFn()
  expect(apiClient.get).toHaveBeenCalledWith('/route-simulation/source')
  useScenarios(true)
  expect(lastQuery().queryKey).toEqual(['route-simulation', 'scenarios'])
})

it('only fetches a scenario once one is picked', () => {
  ;(useQuery as jest.Mock).mockReturnValue({})
  useScenario(null)
  expect(lastQuery().enabled).toBe(false)
  useScenario('s1')
  expect(lastQuery().queryKey).toEqual(['route-simulation', 'scenarios', 's1'])
  expect(lastQuery().enabled).toBe(true)
})

it('invalidates the scenario list after every write', async () => {
  const invalidateQueries = jest.fn()
  ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
  ;(useMutation as jest.Mock).mockReturnValue({})
  useCreateScenario()
  await lastMutation().mutationFn({ name: 'A', payload: {} })
  expect(apiClient.post).toHaveBeenCalledWith('/route-simulation/scenarios', { name: 'A', payload: {} })
  lastMutation().onSuccess()
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['route-simulation', 'scenarios'] })
  useUpdateScenario()
  await lastMutation().mutationFn({ id: 's1', body: { revision: 2 } })
  expect(apiClient.patch).toHaveBeenCalledWith('/route-simulation/scenarios/s1', { revision: 2 })
  useDeleteScenario()
  await lastMutation().mutationFn('s1')
  expect(apiClient.delete).toHaveBeenCalledWith('/route-simulation/scenarios/s1')
})
