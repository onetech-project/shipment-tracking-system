import 'reflect-metadata'
import { DiscoveryService, MetadataScanner } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { PERMISSION_KEY } from '../decorators/authorize.decorator'
import { buildAuthMap } from './build-auth-map'

class FakeController {
  publicRoute() {}
  privateRoute() {}
  authorizedRoute() {}
}

// Emulate @Public() on publicRoute and @Authorize(read.user) on authorizedRoute
Reflect.defineMetadata(IS_PUBLIC_KEY, true, FakeController.prototype.publicRoute)
Reflect.defineMetadata(PERMISSION_KEY, 'read.user', FakeController.prototype.authorizedRoute)

function makeStubs() {
  const instance = new FakeController()
  const discovery = {
    getControllers: () => [{ instance, metatype: FakeController }],
  } as unknown as DiscoveryService
  const scanner = new MetadataScanner()
  return { discovery, scanner }
}

describe('buildAuthMap', () => {
  it('marks @Public() handlers as public', () => {
    const { discovery, scanner } = makeStubs()
    const map = buildAuthMap(discovery, scanner)
    expect(map.get('FakeController.publicRoute')).toEqual({ isPublic: true, permission: undefined })
  })

  it('captures the @Authorize permission and keeps the route private', () => {
    const { discovery, scanner } = makeStubs()
    const map = buildAuthMap(discovery, scanner)
    expect(map.get('FakeController.authorizedRoute')).toEqual({
      isPublic: false,
      permission: 'read.user',
    })
  })

  it('marks handlers with no auth metadata as private with no permission', () => {
    const { discovery, scanner } = makeStubs()
    const map = buildAuthMap(discovery, scanner)
    expect(map.get('FakeController.privateRoute')).toEqual({
      isPublic: false,
      permission: undefined,
    })
  })
})
