import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { Permission } from '@shared/auth';
import { RbacGuard } from '../guards/rbac.guard';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Apply on a controller method to enforce a specific permission via RbacGuard.
 * Usage: @Authorize(Permission.READ_USER)
 */
export const Authorize = (permission: Permission) =>
  applyDecorators(SetMetadata(PERMISSION_KEY, permission), UseGuards(RbacGuard));
