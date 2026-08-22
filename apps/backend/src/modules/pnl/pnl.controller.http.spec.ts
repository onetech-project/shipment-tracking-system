/**
 * The one P&L spec that goes through real HTTP.
 *
 * pnl.controller.spec.ts calls controller methods directly and pnl-vendor-comparison.integration
 * .spec.ts calls PnlService directly, so neither ever executes Express's query-string parsing.
 * That parsing is exactly where the `columns` param is fragile: qs hands over a bare string for a
 * single occurrence and an array for two or more, and a handler that assumed "always an array"
 * would iterate that string one character at a time. Only a real request can show the difference.
 */
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import request from 'supertest'
import { PnlController } from './pnl.controller'
import { PnlService } from './pnl.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'

const EMPTY = { columns: [], rows: [], footer: [], coverage: { revenueInColumns: 0, revenuePeriod: 0 } }

const EMPTY_DRILLDOWN = { data: [], total: 0 }

const mockService = {
  getVendorComparison: jest.fn().mockResolvedValue(EMPTY),
  getAwbDrilldown: jest.fn().mockResolvedValue(EMPTY_DRILLDOWN),
}

describe('PnlController query-string parsing (HTTP)', () => {
  let app: INestApplication

  beforeEach(async () => {
    jest.clearAllMocks()
    mockService.getVendorComparison.mockResolvedValue(EMPTY)
    mockService.getAwbDrilldown.mockResolvedValue(EMPTY_DRILLDOWN)

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PnlController],
      providers: [{ provide: PnlService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(ALLOW_ALL_GUARD)
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()

    app = module.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.init()
  })

  afterEach(() => app.close())

  it('reads a repeated columns param as one pick per occurrence', async () => {
    await request(app.getHttpServer())
      .get('/pnl/breakdown/vendor-comparison')
      .query({ cycle: '2026-05-1H' })
      // .query() with an array emits the param twice, which is the wire shape the frontend sends.
      .query('columns=vg%3A11111111-1111-4111-8111-111111111111&columns=v%3APT%20Kargo%2C%20Tbk')
      .expect(200)

    expect(mockService.getVendorComparison).toHaveBeenCalledWith(
      [
        { kind: 'group', id: '11111111-1111-4111-8111-111111111111' },
        { kind: 'vendor', name: 'PT Kargo, Tbk' },
      ],
      '2026-05-1H',
      undefined,
      undefined,
      undefined,
    )
  })

  it('reads a single columns occurrence as one pick, not one pick per character', async () => {
    await request(app.getHttpServer())
      .get('/pnl/breakdown/vendor-comparison')
      .query({ cycle: '2026-05-1H' })
      .query('columns=v%3AESP')
      .expect(200)

    expect(mockService.getVendorComparison).toHaveBeenCalledWith(
      [{ kind: 'vendor', name: 'ESP' }],
      '2026-05-1H',
      undefined,
      undefined,
      undefined,
    )
  })

  it('answers 400 for a malformed descriptor instead of silently dropping a column', async () => {
    await request(app.getHttpServer())
      .get('/pnl/breakdown/vendor-comparison')
      .query({ cycle: '2026-05-1H' })
      .query('columns=ESP')
      .expect(400)

    expect(mockService.getVendorComparison).not.toHaveBeenCalled()
  })

  it('reads a repeated vendor param on the AWB drilldown', async () => {
    await request(app.getHttpServer())
      .get('/pnl/awb-drilldown')
      .query({ cycle: '2026-05-1H' })
      // .query() with an array emits the param twice, which is the wire shape the frontend sends.
      .query('vendor=ESP&vendor=Angkasa')
      .expect(200)

    expect(mockService.getAwbDrilldown).toHaveBeenCalledWith(
      1,
      50,
      '2026-05-1H',
      undefined,
      undefined,
      undefined,
      {
        routes: [],
        dateFrom: undefined,
        dateTo: undefined,
        vendors: ['ESP', 'Angkasa'],
      },
    )
  })
})
