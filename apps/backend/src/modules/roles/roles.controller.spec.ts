import { Test, TestingModule } from '@nestjs/testing'
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common'
import request from 'supertest'
import { APP_GUARD } from '@nestjs/core'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'
import { RbacGuard } from '../../common/guards/rbac.guard'
import {
  makeAuthGuard,
  ALLOW_ALL_GUARD,
  DENY_GUARD,
  UNAUTH_GUARD,
  SUPER_ADMIN_USER,
} from '../../test/test-helpers'

const ORG_ID = SUPER_ADMIN_USER.organizationId
const ROLE_ID = 'c0000000-0000-4000-8000-000000000001'
const USER_ID = SUPER_ADMIN_USER.id
const PERM_ID = 'd0000000-0000-4000-8000-000000000001'

const ROLE = {
  id: ROLE_ID,
  name: 'Manager',
  description: 'Management role',
  organizationId: ORG_ID,
  isSystem: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  assignPermissions: jest.fn(),
  assignRole: jest.fn(),
  revokeRole: jest.fn(),
}

async function buildApp(
  authGuard = makeAuthGuard(),
  rbacGuard = ALLOW_ALL_GUARD
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [RolesController],
    providers: [
      { provide: RolesService, useValue: mockService },
      { provide: APP_GUARD, useValue: authGuard },
    ],
  })
    .overrideGuard(RbacGuard)
    .useValue(rbacGuard)
    .compile()

  const app = module.createNestApplication()
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  )
  await app.init()
  return app
}

describe('RolesController (integration)', () => {
  let app: INestApplication

  beforeEach(async () => {
    jest.clearAllMocks()
    app = await buildApp()
  })

  afterEach(() => app.close())

  describe('GET /roles', () => {
    it('returns 200 with roles for org', async () => {
      mockService.findAll.mockResolvedValue([ROLE])
      const res = await request(app.getHttpServer()).get('/roles')
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].organizationId).toBe(ORG_ID)
      expect(mockService.findAll).toHaveBeenCalledWith(SUPER_ADMIN_USER)
    })

    it('returns 403 when permission denied', async () => {
      const restricted = await buildApp(makeAuthGuard(), DENY_GUARD)
      const res = await request(restricted.getHttpServer()).get('/roles')
      expect(res.status).toBe(403)
      await restricted.close()
    })

    it('returns 401 when not authenticated', async () => {
      const unauth = await buildApp(UNAUTH_GUARD as any)
      const res = await request(unauth.getHttpServer()).get('/roles')
      expect(res.status).toBe(401)
      await unauth.close()
    })
  })

  describe('GET /roles/:id', () => {
    it('returns 200 with role', async () => {
      mockService.findOne.mockResolvedValue(ROLE)
      const res = await request(app.getHttpServer()).get(`/roles/${ROLE_ID}`)
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(ROLE_ID)
    })

    it('returns 404 when role not found', async () => {
      mockService.findOne.mockRejectedValue(new NotFoundException('Role not found'))
      const res = await request(app.getHttpServer()).get(`/roles/${ROLE_ID}`)
      expect(res.status).toBe(404)
    })

    it('returns 400 on invalid UUID param', async () => {
      const res = await request(app.getHttpServer()).get('/roles/not-a-uuid')
      expect(res.status).toBe(400)
    })
  })

  describe('POST /roles', () => {
    it('returns 201 on create', async () => {
      mockService.create.mockResolvedValue(ROLE)
      const res = await request(app.getHttpServer())
        .post('/roles')
        .send({ name: 'Manager', description: 'Management role' })
      expect(res.status).toBe(201)
      expect(mockService.create).toHaveBeenCalledWith(
        { name: 'Manager', description: 'Management role' },
        ORG_ID,
        USER_ID
      )
    })

    it('returns 409 when role name already exists', async () => {
      mockService.create.mockRejectedValue(
        new ConflictException('Role with this name already exists')
      )
      const res = await request(app.getHttpServer()).post('/roles').send({ name: 'Manager' })
      expect(res.status).toBe(409)
    })

    it('returns 400 when name is missing', async () => {
      const res = await request(app.getHttpServer()).post('/roles').send({ description: 'No name' })
      expect(res.status).toBe(400)
    })
  })

  describe('PUT /roles/:id', () => {
    it('returns 200 on update', async () => {
      mockService.update.mockResolvedValue({ ...ROLE, name: 'Senior Manager' })
      const res = await request(app.getHttpServer())
        .put(`/roles/${ROLE_ID}`)
        .send({ name: 'Senior Manager' })
      expect(res.status).toBe(200)
    })

    it('returns 400 on system role modification', async () => {
      mockService.update.mockRejectedValue(new BadRequestException('Cannot modify system roles'))
      const res = await request(app.getHttpServer())
        .put(`/roles/${ROLE_ID}`)
        .send({ name: 'Admin' })
      expect(res.status).toBe(400)
    })

    it('returns 404 when role not found', async () => {
      mockService.update.mockRejectedValue(new NotFoundException('Role not found'))
      const res = await request(app.getHttpServer()).put(`/roles/${ROLE_ID}`).send({ name: 'New' })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /roles/:id', () => {
    it('returns 204 on delete', async () => {
      mockService.delete.mockResolvedValue(undefined)
      const res = await request(app.getHttpServer()).delete(`/roles/${ROLE_ID}`)
      expect(res.status).toBe(204)
      expect(mockService.delete).toHaveBeenCalledWith(ROLE_ID, ORG_ID, USER_ID)
    })

    it('returns 400 when trying to delete system role', async () => {
      mockService.delete.mockRejectedValue(new BadRequestException('Cannot delete system roles'))
      const res = await request(app.getHttpServer()).delete(`/roles/${ROLE_ID}`)
      expect(res.status).toBe(400)
    })
  })

  describe('PUT /roles/:id/permissions', () => {
    it('returns 200 and calls assignPermissions', async () => {
      mockService.assignPermissions.mockResolvedValue(undefined)
      const res = await request(app.getHttpServer())
        .put(`/roles/${ROLE_ID}/permissions`)
        .send({ permissionIds: [PERM_ID] })
      expect(res.status).toBe(200)
      expect(mockService.assignPermissions).toHaveBeenCalledWith(
        ROLE_ID,
        { permissionIds: [PERM_ID] },
        ORG_ID,
        USER_ID
      )
    })

    it('returns 400 when permissionIds contains invalid UUIDs', async () => {
      const res = await request(app.getHttpServer())
        .put(`/roles/${ROLE_ID}/permissions`)
        .send({ permissionIds: ['not-a-uuid'] })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /roles/assign', () => {
    it('returns 201 and assigns role to user', async () => {
      mockService.assignRole.mockResolvedValue(undefined)
      const res = await request(app.getHttpServer())
        .post('/roles/assign')
        .send({ userId: USER_ID, roleId: ROLE_ID })
      expect(res.status).toBe(201)
    })

    it('returns 409 when user already has role', async () => {
      mockService.assignRole.mockRejectedValue(new ConflictException('User already has this role'))
      const res = await request(app.getHttpServer())
        .post('/roles/assign')
        .send({ userId: USER_ID, roleId: ROLE_ID })
      expect(res.status).toBe(409)
    })
  })

  describe('DELETE /roles/:roleId/users/:userId', () => {
    it('returns 204 on revoke', async () => {
      mockService.revokeRole.mockResolvedValue(undefined)
      const res = await request(app.getHttpServer()).delete(`/roles/${ROLE_ID}/users/${USER_ID}`)
      expect(res.status).toBe(204)
    })
  })
})
