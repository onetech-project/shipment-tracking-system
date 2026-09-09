/**
 * The drivers hook shipped with no spec at all, so every endpoint URL and verb in it was unpinned:
 * post('/fleet/drivers') mutated to post('/fleet/wrong') survived the whole 692-test frontend suite
 * and tsc --noEmit. This file pins each of the four calls and the select projection.
 *
 * useQuery/useMutation/useQueryClient are mocked so the assertions read the exact config TanStack
 * Query would see, without a live QueryClient — the same technique useFleetMasterData.spec.ts uses.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  useCreateFleetDriver,
  useDeleteFleetDriver,
  useFleetDrivers,
  useFleetMasterDataByCategory,
  useUpdateFleetDriver,
} from './useFleetDrivers'

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}))
jest.mock('@/shared/api/client', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
  },
}))

beforeEach(() => jest.clearAllMocks())

const queryConfig = () => (useQuery as jest.Mock).mock.calls[0][0]
const mutationConfig = () => (useMutation as jest.Mock).mock.calls[0][0]

describe('useFleetDrivers', () => {
  // The search term and the inactive flag are both part of the key: without them a search for
  // "Budi" would serve the unfiltered list out of cache and the box would look broken.
  it('keys the list by search term and inactive flag', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetDrivers({ q: 'Budi', includeInactive: true })

    expect(queryConfig().queryKey).toEqual([
      'fleet',
      'drivers',
      { q: 'Budi', includeInactive: true },
    ])
  })

  it('defaults to an empty search over active drivers only', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetDrivers()

    expect(queryConfig().queryKey).toEqual(['fleet', 'drivers', { q: '', includeInactive: false }])
  })

  it('fetches the driver list with the search term as a parameter', async () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetDrivers({ q: 'Budi' })

    await queryConfig().queryFn()
    expect(apiClient.get).toHaveBeenCalledWith('/fleet/drivers', {
      params: { q: 'Budi', includeInactive: false },
    })
  })

  // An empty box must drop the parameter rather than send q='': the backend builds an ILIKE from
  // whatever arrives, and an empty pattern is a filter that is present but matches by accident.
  it('omits an empty search term instead of sending a blank one', async () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetDrivers({ q: '' })

    await queryConfig().queryFn()
    expect(apiClient.get).toHaveBeenCalledWith('/fleet/drivers', {
      params: { q: undefined, includeInactive: false },
    })
  })

  // Frontend and backend deploy in parallel, so a driver served without its optional columns must
  // still render. Compared against a bare object literal, never objectContaining: a dropped field
  // or one hardcoded to null is exactly what slips through a partial match.
  it('fills in the optional columns an older backend may omit', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetDrivers()

    expect(queryConfig().select([{ id: 'd1', nama: 'Budi' }])).toEqual([
      {
        id: 'd1',
        nama: 'Budi',
        telepon: null,
        simNomor: null,
        simJenisId: null,
        simJenis: null,
        simExpiresAt: null,
        // A backend that cannot answer has not said the driver is archived.
        isActive: true,
      },
    ])
  })

  // The isActive default is the load-bearing half: `row.isActive ?? true` mutated to
  // `?? false` would hide every driver from a backend that omits the column, and mutated to
  // `row.isActive === true` would do the same. Both fail here.
  it('defaults a missing isActive to true rather than hiding the driver', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetDrivers()

    expect(queryConfig().select([{ id: 'd1', nama: 'Budi' }])[0].isActive).toBe(true)
  })

  // A backend that explicitly says false must not be papered over by that default — only a
  // genuinely absent field falls back. Without this the ?? could be a plain || and nothing notices.
  it('passes an explicit isActive false through untouched', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetDrivers()

    expect(
      queryConfig().select([{ id: 'd1', nama: 'Budi', isActive: false }])[0].isActive,
    ).toBe(false)
  })

  it('passes every explicit column through untouched', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetDrivers()

    expect(
      queryConfig().select([
        {
          id: 'd2',
          nama: 'Budi Santoso',
          telepon: '0812',
          simNomor: 'SIM-9',
          simJenisId: 's1',
          simJenis: { id: 's1', label: 'B1 Umum' },
          simExpiresAt: '2027-01-31',
          isActive: true,
        },
      ]),
    ).toEqual([
      {
        id: 'd2',
        nama: 'Budi Santoso',
        telepon: '0812',
        simNomor: 'SIM-9',
        simJenisId: 's1',
        simJenis: { id: 's1', label: 'B1 Umum' },
        simExpiresAt: '2027-01-31',
        isActive: true,
      },
    ])
  })

  it('caches the driver list for a minute', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetDrivers()

    expect(queryConfig().staleTime).toBe(60 * 1000)
  })
})

describe('useFleetMasterDataByCategory', () => {
  // Keyed without the 'manage' segment that useFleetMasterData uses, because this is the dropdown
  // cache: same endpoint, different question. Sharing one key would let the management screen's
  // includeInactive=true response serve deactivated rows into the driver form's Jenis SIM select.
  it('keys the dropdown cache apart from the management list', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetMasterDataByCategory('jenis_sim')

    expect(queryConfig().queryKey).toEqual(['fleet', 'master-data', 'jenis_sim'])
  })

  // Deliberately omits includeInactive: this feeds a dropdown, and a row an admin deactivated to
  // stop it being offered must not be offered. That omission is the whole point of the hook.
  it('asks for the category without requesting inactive rows', async () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetMasterDataByCategory('jenis_sim')

    await queryConfig().queryFn()
    expect(apiClient.get).toHaveBeenCalledWith('/fleet/master-data', {
      params: { category: 'jenis_sim' },
    })
  })

  // Master data barely moves and feeds every dropdown in the module, so it outlives the lists it
  // populates by five minutes rather than one.
  it('caches master data five times longer than the driver list', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetMasterDataByCategory('jenis_sim')

    expect(queryConfig().staleTime).toBe(5 * 60 * 1000)
  })
})

describe('useCreateFleetDriver', () => {
  // post('/fleet/drivers') -> post('/fleet/wrong') is a confirmed survivor of the full suite.
  it('posts the payload untouched to the drivers collection', async () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useCreateFleetDriver()

    const payload = {
      nama: 'Budi',
      telepon: '0812',
      simNomor: 'SIM-9',
      simJenisId: 's1',
      simExpiresAt: '2027-01-31',
    }
    await mutationConfig().mutationFn(payload)
    expect(apiClient.post).toHaveBeenCalledWith('/fleet/drivers', payload)
    expect(apiClient.patch).not.toHaveBeenCalled()
  })

  it('invalidates the driver list after a create', () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useCreateFleetDriver()

    mutationConfig().onSuccess()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['fleet', 'drivers'] })
  })
})

describe('useUpdateFleetDriver', () => {
  // The id belongs in the path, not the body: a PATCH to the collection would 404, and a PATCH to
  // the wrong id would silently edit another driver.
  it('patches the given id with the payload as the body', async () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useUpdateFleetDriver()

    const payload = { nama: 'Budi Santoso' }
    await mutationConfig().mutationFn({ id: 'd1', payload })
    expect(apiClient.patch).toHaveBeenCalledWith('/fleet/drivers/d1', payload)
    expect(apiClient.post).not.toHaveBeenCalled()
  })

  it('invalidates the driver list after an update', () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useUpdateFleetDriver()

    mutationConfig().onSuccess()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['fleet', 'drivers'] })
  })
})

describe('useDeleteFleetDriver', () => {
  it('deletes the given id', async () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useDeleteFleetDriver()

    await mutationConfig().mutationFn('d1')
    expect(apiClient.delete).toHaveBeenCalledWith('/fleet/drivers/d1')
  })

  it('invalidates the driver list after a delete', () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useDeleteFleetDriver()

    mutationConfig().onSuccess()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['fleet', 'drivers'] })
  })
})
