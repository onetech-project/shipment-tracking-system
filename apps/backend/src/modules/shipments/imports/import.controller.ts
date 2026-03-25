import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Express } from 'express'
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator'
import { ImportService } from './import.service'
import { ResolveConflictDto } from './dto/resolve-conflict.dto'

const ALLOWED_MIME = 'application/pdf'
const ALLOWED_EXT = '.pdf'

@Controller('shipments/imports')
export class ImportController {
  constructor(private readonly service: ImportService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    if (!file) {
      throw new BadRequestException({ code: 'INVALID_FILE_TYPE', message: 'No file uploaded' })
    }

    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'))
    if (file.mimetype !== ALLOWED_MIME || ext !== ALLOWED_EXT) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'Only PDF files are accepted',
      })
    }

    return this.service.createUploadRecord(user.organizationId, user.id, file)
  }

  @Get('history')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string
  ) {
    return this.service.getHistory(user.organizationId, limit, cursor)
  }

  @Get(':id')
  async getStatus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getStatus(id, user.organizationId)
  }

  @Get(':id/errors')
  async getErrors(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getErrors(id, user.organizationId)
  }

  @Get(':id/items')
  async getItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.getImportItems(id, user.organizationId, page, limit)
  }

  @Post(':id/conflicts/resolve')
  async resolveConflicts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveConflictDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.service.resolveConflicts(id, user.organizationId, dto.decisions)
  }
}
