import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto, AssignRoleDto } from './dto/role.dto';
import { Authorize } from '../../common/decorators/authorize.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '@shared/auth';

@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @Authorize(Permission.READ_ROLE)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user);
  }

  @Get(':id')
  @Authorize(Permission.READ_ROLE)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user.organizationId);
  }

  @Post()
  @Authorize(Permission.CREATE_ROLE)
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.organizationId, user.id);
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_ROLE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user.organizationId, user.id);
  }

  @Delete(':id')
  @Authorize(Permission.DELETE_ROLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.delete(id, user.organizationId, user.id);
  }

  @Patch(':id/permissions')
  @Authorize(Permission.UPDATE_ROLE)
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.assignPermissions(id, dto, user.organizationId, user.id);
  }

  @Post('assign')
  @Authorize(Permission.UPDATE_ROLE)
  assignRole(@Body() dto: AssignRoleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.assignRole(dto, user.organizationId, user.id);
  }

  @Delete(':roleId/users/:userId')
  @Authorize(Permission.UPDATE_ROLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.revokeRole(userId, roleId, user.organizationId, user.id);
  }
}
