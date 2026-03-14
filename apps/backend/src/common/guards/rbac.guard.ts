import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/authorize.decorator';
import { Permission } from '@shared/auth';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { Request } from 'express';

/**
 * Enforces permission-based access control.
 * Applied via @Authorize(Permission.xxx) decorator.
 * Super Admins bypass all permission checks.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    // Super admin bypasses all permission checks
    if (user.isSuperAdmin) {
      return true;
    }

    if (!user.organizationId) {
      throw new ForbiddenException('No organization context');
    }

    const permissions = await this.permissionService.getPermissionsForUser(
      user.id,
      user.organizationId,
    );

    if (!permissions.has(required as string)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }

    return true;
  }
}
