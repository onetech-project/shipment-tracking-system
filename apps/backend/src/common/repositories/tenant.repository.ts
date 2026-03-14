import { Repository, DataSource, EntityTarget, FindManyOptions, FindOneOptions } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { CLS_TENANT_ID } from '../interceptors/tenant-cls.interceptor';

/**
 * Abstract base repository that automatically scopes queries to the current
 * organization from the CLS (Continuation Local Storage) context.
 *
 * Extend this for any entity with an `organization_id` column to get
 * automatic tenant isolation without manual filtering at every call site.
 */
export abstract class TenantRepository<T extends { organizationId?: string }> extends Repository<T> {
  constructor(
    target: EntityTarget<T>,
    dataSource: DataSource,
    protected readonly cls: ClsService,
  ) {
    super(target, dataSource.createEntityManager());
  }

  protected get currentOrgId(): string | null {
    return this.cls.get<string | null>(CLS_TENANT_ID) ?? null;
  }

  /** Returns a FindManyOptions where clause with tenant scope applied */
  protected withTenantScope(options: FindManyOptions<T> = {}): FindManyOptions<T> {
    const orgId = this.currentOrgId;
    if (!orgId) return options;

    return {
      ...options,
      where: {
        ...(options.where as object),
        organizationId: orgId,
      } as FindManyOptions<T>['where'],
    };
  }

  /** Returns a FindOneOptions where clause with tenant scope applied */
  protected withTenantScopeOne(options: FindOneOptions<T> = {}): FindOneOptions<T> {
    const orgId = this.currentOrgId;
    if (!orgId) return options;

    return {
      ...options,
      where: {
        ...(options.where as object),
        organizationId: orgId,
      } as FindOneOptions<T>['where'],
    };
  }
}
