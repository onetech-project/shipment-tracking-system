import { DiscoveryService, MetadataScanner } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { PERMISSION_KEY } from '../decorators/authorize.decorator'
import { AuthMap } from './apply-auth-metadata'

/**
 * Walks every registered controller and reads the same auth metadata the guards
 * consume (`@Public()` and `@Authorize()`), producing a map keyed by
 * `${ControllerName}.${methodName}` — matching the Swagger operationId factory.
 * Method-level metadata wins over class-level for both flags (matching the
 * guards' `getAllAndOverride([handler, class])`): a class-level `@Public()`
 * marks all handlers public, and a class-level `@Authorize()` permission is
 * inherited by every handler that lacks its own. If two controllers ever share
 * a class name, the colliding entry defaults to locked so a duplicate can never
 * silently render a private route public.
 */
export function buildAuthMap(discovery: DiscoveryService, scanner: MetadataScanner): AuthMap {
  const map: AuthMap = new Map()

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper
    if (!instance || !metatype) continue

    const controllerName = metatype.name
    const prototype = Object.getPrototypeOf(instance)
    const classIsPublic = Reflect.getMetadata(IS_PUBLIC_KEY, metatype) === true
    const classPermission: string | undefined = Reflect.getMetadata(PERMISSION_KEY, metatype)

    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[methodName]
      if (typeof handler !== 'function') continue

      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true || classIsPublic
      // Method-level permission wins; fall back to class-level (matches RbacGuard's getAllAndOverride).
      const permission: string | undefined =
        Reflect.getMetadata(PERMISSION_KEY, handler) ?? classPermission

      const key = `${controllerName}.${methodName}`
      // Safety net: distinct controller class names are assumed (they map 1:1 to Swagger
      // operationIds). If two controllers ever share a class name, default the colliding
      // entry to locked so a duplicate can never silently render a private route public.
      if (map.has(key)) {
        map.set(key, { isPublic: false, permission: undefined })
        continue
      }
      map.set(key, { isPublic, permission })
    }
  }

  return map
}
