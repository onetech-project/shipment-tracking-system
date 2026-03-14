import { Controller, Get, Param, ParseUUIDPipe, NotFoundException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { Authorize } from '../../common/decorators/authorize.decorator';
import { Permission } from '@shared/auth';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get()
  @Authorize(Permission.READ_PERMISSION)
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Authorize(Permission.READ_PERMISSION)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const p = await this.service.findOne(id);
    if (!p) throw new NotFoundException('Permission not found');
    return p;
  }
}
