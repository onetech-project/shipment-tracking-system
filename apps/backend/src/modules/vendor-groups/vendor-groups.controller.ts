import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { VendorGroupsService } from './vendor-groups.service'
import { CreateVendorGroupDto } from './dto/create-vendor-group.dto'
import { UpdateVendorGroupDto } from './dto/update-vendor-group.dto'

@ApiTags('Vendor Groups')
@Controller('vendor-groups')
@UseGuards(JwtAuthGuard)
export class VendorGroupsController {
  constructor(private readonly service: VendorGroupsService) {}

  @Get()
  @Authorize(Permission.READ_VENDOR_GROUP)
  findAll() {
    return this.service.findAll()
  }

  // Declared before ':id' would be, and is a distinct literal path, so no route shadowing.
  @Get('available-vendors')
  @Authorize(Permission.READ_VENDOR_GROUP)
  getAvailableVendors() {
    return this.service.getAvailableVendors()
  }

  @Post()
  @Authorize(Permission.CREATE_VENDOR_GROUP)
  create(@Body() dto: CreateVendorGroupDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_VENDOR_GROUP)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorGroupDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_VENDOR_GROUP)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
