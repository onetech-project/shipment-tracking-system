import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AuditLog } from './entities/audit-log.entity'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator'
import { Permission } from '@shared/auth'

@Controller('audit')
export class AuditController {
  constructor(@InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>) {}

  @Get()
  @Authorize(Permission.READ_AUDIT)
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number
  ) {
    let auditLogs: [AuditLog[], number]
    try {
      auditLogs = await this.auditRepo.findAndCount({
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      })
    } catch (error) {
      console.error('Error fetching audit logs:', error)
      throw new Error('Failed to fetch audit logs')
    }
    return auditLogs
  }
}
