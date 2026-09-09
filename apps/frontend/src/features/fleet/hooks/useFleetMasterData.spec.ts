/**
 * Added beyond the brief, which specifies no hook spec. Two invariants here have no other guard:
 * includeInactive, without which a deactivated row disappears from the very screen that exists to
 * reactivate it, and the ['fleet'] invalidation prefix, without which a new pool row reaches the
 * management table but never the dropdown caches that feed the vehicle form.
 *
 * useQuery/useMutation/useQueryClient are mocked so the assertions read the exact config TanStack
 * Query would see, without needing a live QueryClient — the same technique useVendorGroups.spec.ts
 * uses.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  useCreateFleetMasterData,
  useDeleteFleetMasterData,
  useFleetMasterData,
  useUpdateFleetMasterData,
} from './useFleetMasterData'

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

describe('useFleetMasterData', () => {
  it('keys the management list apart from the dropdown cache, per category', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetMasterData('leasing')

    expect(queryConfig().queryKey).toEqual(['fleet', 'master-data', 'manage', 'leasing'])
  })

  // The management screen is where a deactivated row gets reactivated, so it has to be listed.
  // useFleetMasterDataByCategory, which feeds dropdowns, deliberately omits the flag.
  it('asks for inactive rows too, scoped to the selected category', async () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetMasterData('jenis_sim')

    await queryConfig().queryFn()
    expect(apiClient.get).toHaveBeenCalledWith('/fleet/master-data', {
      params: { category: 'jenis_sim', includeInactive: true },
    })
  })

  // Frontend and backend deploy in parallel, so a row served without its optional columns must
  // still render. isActive defaults to true: a backend that cannot answer has not said the row is
  // deactivated. Compared against a bare object so a dropped field is caught, not ignored.
  it('fills in the optional columns a older backend may omit', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetMasterData('jenis_dokumen')

    expect(
      queryConfig().select([
        { id: 'r1', category: 'jenis_dokumen', code: 'kir', label: 'KIR' },
      ]),
    ).toEqual([
      {
        id: 'r1',
        category: 'jenis_dokumen',
        code: 'kir',
        label: 'KIR',
        sortOrder: 0,
        isActive: true,
        warnDays: null,
        defaultValidMonths: null,
        isRequired: null,
      },
    ])
  })

  // A backend that explicitly says false/0 must not be papered over by the defaults — only a
  // genuinely absent field falls back.
  it('passes explicit values through untouched, including false and zero', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetMasterData('jenis_dokumen')

    expect(
      queryConfig().select([
        {
          id: 'r2',
          category: 'jenis_dokumen',
          code: 'servis',
          label: 'Servis Berkala',
          sortOrder: 3,
          isActive: false,
          warnDays: 14,
          defaultValidMonths: 6,
          isRequired: false,
        },
      ]),
    ).toEqual([
      {
        id: 'r2',
        category: 'jenis_dokumen',
        code: 'servis',
        label: 'Servis Berkala',
        sortOrder: 3,
        isActive: false,
        warnDays: 14,
        defaultValidMonths: 6,
        isRequired: false,
      },
    ])
  })

  // warnDays 0 is the value the defaults must not swallow: it means "warn on the expiry date
  // itself", while null means "let the backend apply its 30-day default". A falsy check here turns
  // an operator's deliberate 0 into null on the way out of the cache, so the management table shows
  // no threshold and the edit dialog reopens with an empty field.
  it('keeps a zero warning threshold distinct from an absent one', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetMasterData('jenis_dokumen')

    expect(
      queryConfig().select([
        {
          id: 'r3',
          category: 'jenis_dokumen',
          code: 'kir',
          label: 'KIR Tahunan',
          sortOrder: 0,
          isActive: true,
          warnDays: 0,
          defaultValidMonths: 0,
          isRequired: false,
        },
      ]),
    ).toEqual([
      {
        id: 'r3',
        category: 'jenis_dokumen',
        code: 'kir',
        label: 'KIR Tahunan',
        sortOrder: 0,
        isActive: true,
        warnDays: 0,
        defaultValidMonths: 0,
        isRequired: false,
      },
    ])
  })

  // Master data changes rarely and feeds every dropdown in the module, so it is cached for a
  // minute; at staleTime 0 every tab switch and every remount refetches all eight categories.
  it('caches the category list for a minute', () => {
    ;(useQuery as jest.Mock).mockReturnValue({})

    useFleetMasterData('leasing')

    expect(queryConfig().staleTime).toBe(60 * 1000)
  })
})

describe('useCreateFleetMasterData', () => {
  // Invalidating the ['fleet'] prefix rather than one category: a new row has to reach both this
  // table and the dropdown caches keyed ['fleet', 'master-data', category].
  it('posts the payload untouched and invalidates the whole fleet prefix', async () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useCreateFleetMasterData()

    const payload = {
      category: 'leasing' as const,
      code: 'bca_finance',
      label: 'BCA Finance',
      sortOrder: 5,
      warnDays: null,
    }
    await mutationConfig().mutationFn(payload)
    expect(apiClient.post).toHaveBeenCalledWith('/fleet/master-data', payload)

    mutationConfig().onSuccess()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['fleet'] })
  })
})

describe('useUpdateFleetMasterData', () => {
  it('patches the given id with the payload and invalidates the whole fleet prefix', async () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useUpdateFleetMasterData()

    const payload = { label: 'BCA Finance', sortOrder: 5, warnDays: null }
    await mutationConfig().mutationFn({ id: 'r1', payload })
    expect(apiClient.patch).toHaveBeenCalledWith('/fleet/master-data/r1', payload)

    mutationConfig().onSuccess()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['fleet'] })
  })
})

describe('useDeleteFleetMasterData', () => {
  it('deletes the given id and invalidates the whole fleet prefix', async () => {
    const invalidateQueries = jest.fn()
    ;(useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries })
    ;(useMutation as jest.Mock).mockReturnValue({})

    useDeleteFleetMasterData()

    await mutationConfig().mutationFn('r1')
    expect(apiClient.delete).toHaveBeenCalledWith('/fleet/master-data/r1')

    mutationConfig().onSuccess()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['fleet'] })
  })
})
