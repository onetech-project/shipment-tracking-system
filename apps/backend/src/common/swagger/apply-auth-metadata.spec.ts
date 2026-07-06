import { OpenAPIObject } from '@nestjs/swagger'
import { applyAuthMetadata, AuthMap } from './apply-auth-metadata'

function makeDoc(): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: {
      '/auth/login': {
        post: { operationId: 'AuthController.login', security: [{ 'access-token': [] }] },
      },
      '/users': {
        get: {
          operationId: 'UsersController.findAll',
          security: [{ 'access-token': [] }],
          description: 'List users',
        },
      },
      '/audit': {
        get: { operationId: 'AuditController.list', security: [{ 'access-token': [] }] },
      },
    },
  } as unknown as OpenAPIObject
}

describe('applyAuthMetadata', () => {
  it('clears security for public operations', () => {
    const doc = makeDoc()
    const map: AuthMap = new Map([['AuthController.login', { isPublic: true }]])
    applyAuthMetadata(doc, map)
    expect((doc.paths['/auth/login'] as any).post.security).toEqual([])
  })

  it('appends the required permission to the description and keeps security', () => {
    const doc = makeDoc()
    const map: AuthMap = new Map([
      ['UsersController.findAll', { isPublic: false, permission: 'read.user' }],
    ])
    applyAuthMetadata(doc, map)
    const op = (doc.paths['/users'] as any).get
    expect(op.security).toEqual([{ 'access-token': [] }])
    expect(op.description).toContain('read.user')
    expect(op.description).toContain('List users')
  })

  it('leaves operations that are not in the map untouched', () => {
    const doc = makeDoc()
    applyAuthMetadata(doc, new Map())
    expect((doc.paths['/audit'] as any).get.security).toEqual([{ 'access-token': [] }])
  })
})
