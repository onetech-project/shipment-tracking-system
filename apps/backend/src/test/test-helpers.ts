import { ExecutionContext } from '@nestjs/common'
import { AuthenticatedUser } from '../common/decorators/current-user.decorator'

export const SUPER_ADMIN_USER: AuthenticatedUser = {
  id: 'b0000000-0000-4000-8000-000000000001',
  username: 'superadmin',
  organizationId: 'a0000000-0000-4000-8000-000000000001',
  isSuperAdmin: true,
  roles: [],
  permissions: [],
}

export const REGULAR_USER: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000002',
  username: 'user',
  organizationId: 'a0000000-0000-4000-8000-000000000001',
  isSuperAdmin: false,
  roles: [],
  permissions: [],
}

/** Guard mock that injects the given user into every request. */
export function makeAuthGuard(user: AuthenticatedUser = SUPER_ADMIN_USER) {
  return {
    canActivate: (ctx: ExecutionContext) => {
      ctx.switchToHttp().getRequest().user = user
      return true
    },
  }
}

/** Guard mock that always grants access (replaces RbacGuard). */
export const ALLOW_ALL_GUARD = { canActivate: () => true }

/** Guard mock that always denies access with 403. */
export const DENY_GUARD = {
  canActivate: () => {
    const { ForbiddenException } = require('@nestjs/common')
    throw new ForbiddenException('Missing permission')
  },
}

/** Guard mock that simulates an unauthenticated request (401). */
export const UNAUTH_GUARD = {
  canActivate: () => {
    const { UnauthorizedException } = require('@nestjs/common')
    throw new UnauthorizedException('Not authenticated')
  },
}
