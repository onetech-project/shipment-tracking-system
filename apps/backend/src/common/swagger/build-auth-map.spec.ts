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

  it('falls back to class-level @Authorize permission, with method-level override winning', () => {
    class ClassAuthController {
      listThings() {}
      createThing() {}
    }
    // Emulate class-level @Authorize(Permission.READ_PNL)
    Reflect.defineMetadata(PERMISSION_KEY, 'read.pnl', ClassAuthController)
    // Emulate a method-level @Authorize override on createThing
    Reflect.defineMetadata(PERMISSION_KEY, 'create.pnl', ClassAuthController.prototype.createThing)

    const instance = new ClassAuthController()
    const discovery = {
      getControllers: () => [{ instance, metatype: ClassAuthController }],
    } as unknown as DiscoveryService
    const scanner = new MetadataScanner()

    const map = buildAuthMap(discovery, scanner)

    expect(map.get('ClassAuthController.listThings')).toEqual({
      isPublic: false,
      permission: 'read.pnl',
    })
    expect(map.get('ClassAuthController.createThing')).toEqual({
      isPublic: false,
      permission: 'create.pnl',
    })
  })

  it('marks all methods public when @Public() is applied at the class level', () => {
    class PublicClassController {
      anything() {}
    }
    // Emulate class-level @Public()
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, PublicClassController)

    const instance = new PublicClassController()
    const discovery = {
      getControllers: () => [{ instance, metatype: PublicClassController }],
    } as unknown as DiscoveryService
    const scanner = new MetadataScanner()

    const map = buildAuthMap(discovery, scanner)

    expect(map.get('PublicClassController.anything')).toEqual({
      isPublic: true,
      permission: undefined,
    })
  })

  it('defaults a duplicate controller class name to locked (collision guard)', () => {
    class Dup1 {
      same() {}
    }
    class Dup2 {
      same() {}
    }
    // Force both controllers to share the same class name, as could happen
    // if two modules independently declare a controller with the same name.
    Object.defineProperty(Dup2, 'name', { value: 'Dup1' })
    // Dup2.same would be public on its own, but the collision must win and lock it.
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, Dup2.prototype.same)

    const discovery = {
      getControllers: () => [
        { instance: new Dup1(), metatype: Dup1 },
        { instance: new Dup2(), metatype: Dup2 },
      ],
    } as unknown as DiscoveryService
    const scanner = new MetadataScanner()

    const map = buildAuthMap(discovery, scanner)

    expect(map.get('Dup1.same')).toEqual({ isPublic: false, permission: undefined })
  })
})
