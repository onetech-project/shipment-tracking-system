import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Request } from 'express'

export interface AuthenticatedUser {
  id: string
  username: string
  organizationId: string | null
  isSuperAdmin: boolean
  roles: string[]
  permissions: string[]
}

/** Inject the current authenticated user from request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>()
    return request.user
  }
)
