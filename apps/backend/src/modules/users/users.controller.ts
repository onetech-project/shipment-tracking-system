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
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, AdminResetPasswordDto } from './dto/user.dto';
import { Authorize } from '../../common/decorators/authorize.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '@shared/auth';

@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @Authorize(Permission.READ_USER)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user);
  }

  @Get(':id')
  @Authorize(Permission.READ_USER)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user.organizationId);
  }

  @Post()
  @Authorize(Permission.CREATE_USER)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.organizationId, user.id);
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_USER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user.organizationId, user.id);
  }

  @Delete(':id')
  @Authorize(Permission.DELETE_USER)
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.deactivate(id, user.organizationId, user.id);
  }

  @Patch(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangePasswordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.changePassword(id, dto, user.id);
  }

  @Patch(':id/password/reset')
  @Authorize(Permission.UPDATE_USER)
  @HttpCode(HttpStatus.NO_CONTENT)
  adminResetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.adminResetPassword(id, dto, user.organizationId, user.id);
  }

  @Patch(':id/unlock')
  @Authorize(Permission.UPDATE_USER)
  @HttpCode(HttpStatus.NO_CONTENT)
  unlock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.unlockUser(id, user.organizationId, user.id);
  }
}
