import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { Permission } from '@shared/auth'
import { PnlSettlementService } from './pnl-settlement.service'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = /\.(xlsx|xls|csv)$/i

// Minimal shape of a multer in-memory upload. Declared locally so we don't depend on the global
// Express.Multer namespace augmentation (backend tsconfig restricts `types` to node + jest).
interface UploadedInvoiceFile {
  originalname: string
  buffer: Buffer
}

// FileInterceptor uses in-memory storage by default, so file.buffer is available for parsing.
const uploadInterceptor = FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } })

@Controller('pnl-settlement')
@UseGuards(JwtAuthGuard)
export class PnlSettlementController {
  constructor(private readonly service: PnlSettlementService) {}

  @Post('preview')
  @Authorize(Permission.CREATE_PNL_SETTLEMENT)
  @UseInterceptors(uploadInterceptor)
  preview(@UploadedFile() file?: UploadedInvoiceFile) {
    return this.service.preview(validateFile(file))
  }

  @Post('commit')
  @Authorize(Permission.CREATE_PNL_SETTLEMENT)
  @UseInterceptors(uploadInterceptor)
  commit(@UploadedFile() file?: UploadedInvoiceFile) {
    return this.service.commit(validateFile(file))
  }

  @Get('summary')
  @Authorize(Permission.READ_PNL)
  getSummary(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.service.getSummary(cycle, start, end, basis)
  }

  @Get('to-comparison')
  @Authorize(Permission.READ_PNL)
  getToComparison(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
    @Query('settled') settled?: 'settled' | 'unsettled',
  ) {
    return this.service.getToComparison(page, limit, cycle, start, end, basis, settled)
  }

  @Get('unsettled')
  @Authorize(Permission.READ_PNL)
  getUnsettled(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.service.getUnsettledTos(page, limit, cycle, start, end, basis)
  }
}

function validateFile(file?: UploadedInvoiceFile): Buffer {
  if (!file) throw new BadRequestException('File invoice wajib di-upload (field "file").')
  if (!ALLOWED_EXT.test(file.originalname)) {
    throw new BadRequestException('Format tidak didukung — gunakan .xlsx, .xls, atau .csv.')
  }
  return file.buffer
}
