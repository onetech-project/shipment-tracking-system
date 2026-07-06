import { OpenAPIObject } from '@nestjs/swagger'

export interface RouteAuthInfo {
  isPublic: boolean
  permission?: string
}

/** Keyed by `${ControllerName}.${methodName}`, matching the operationId factory. */
export type AuthMap = Map<string, RouteAuthInfo>

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const

/**
 * Mutates the OpenAPI document so each operation reflects the app's existing
 * auth model:
 *   - public routes get `security: []` (no bearer lock, no token needed)
 *   - `@Authorize` routes get the required permission appended to the description
 * Operations whose operationId is absent from `authMap` are left untouched, so
 * they keep the document-level default security requirement.
 */
export function applyAuthMetadata(document: OpenAPIObject, authMap: AuthMap): void {
  const paths = document.paths ?? {}
  for (const pathKey of Object.keys(paths)) {
    const pathItem = paths[pathKey] as Record<string, any>
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (!operation || typeof operation !== 'object') continue
      const opId: string | undefined = operation.operationId
      if (!opId) continue
      const info = authMap.get(opId)
      if (!info) continue

      if (info.isPublic) {
        operation.security = []
      }
      if (info.permission) {
        const note = `**Requires permission:** \`${info.permission}\``
        operation.description = operation.description
          ? `${operation.description}\n\n${note}`
          : note
      }
    }
  }
}
