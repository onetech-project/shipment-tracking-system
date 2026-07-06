import { DiscoveryService, MetadataScanner } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { PERMISSION_KEY } from '../decorators/authorize.decorator'
import { AuthMap } from './apply-auth-metadata'

/**
 * Walks every registered controller and reads the same auth metadata the guards
 * consume (`@Public()` and `@Authorize()`), producing a map keyed by
 * `${ControllerName}.${methodName}` — matching the Swagger operationId factory.
 * Method-level `@Public()` wins; a class-level `@Public()` marks all handlers.
 */
export function buildAuthMap(discovery: DiscoveryService, scanner: MetadataScanner): AuthMap {
  const map: AuthMap = new Map()

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper
    if (!instance || !metatype) continue

    const controllerName = metatype.name
    const prototype = Object.getPrototypeOf(instance)
    const classIsPublic = Reflect.getMetadata(IS_PUBLIC_KEY, metatype) === true

    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[methodName]
      if (typeof handler !== 'function') continue

      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true || classIsPublic
      const permission: string | undefined = Reflect.getMetadata(PERMISSION_KEY, handler)

      map.set(`${controllerName}.${methodName}`, { isPublic, permission })
    }
  }

  return map
}
