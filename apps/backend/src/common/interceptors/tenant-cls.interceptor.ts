import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

export const CLS_TENANT_ID = 'organizationId';
export const CLS_USER_ID = 'userId';
export const CLS_IS_SUPER_ADMIN = 'isSuperAdmin';

/**
 * Reads the authenticated user from the request and stores
 * organizationId + userId in the CLS context so TenantRepository
 * can scope queries without needing manual injection at every call site.
 */
@Injectable()
export class TenantClsInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    if (request.user) {
      this.cls.set(CLS_TENANT_ID, request.user.organizationId ?? null);
      this.cls.set(CLS_USER_ID, request.user.id);
      this.cls.set(CLS_IS_SUPER_ADMIN, request.user.isSuperAdmin ?? false);
    }

    return next.handle();
  }
}
