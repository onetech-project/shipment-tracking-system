import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/invitation.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Authorize } from '../../common/decorators/authorize.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '@shared/auth';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}

  @Get()
  @Authorize(Permission.READ_INVITATION)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.organizationId);
  }

  @Post()
  @Authorize(Permission.CREATE_INVITATION)
  create(@Body() dto: CreateInvitationDto, @CurrentUser() user: AuthenticatedUser) {
    // Super-admins may specify a target org; others are scoped to their own org
    const orgId = (user.isSuperAdmin && dto.organizationId) ? dto.organizationId : user.organizationId;
    return this.service.create(dto, orgId, user.id);
  }

  @Delete(':id')
  @Authorize(Permission.DELETE_INVITATION)
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.cancel(id, user.organizationId, user.id);
  }

  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  accept(@Query('token') token: string) {
    return this.service.accept(token);
  }
}
