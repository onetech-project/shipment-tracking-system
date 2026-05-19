import { Controller, Get, Param, Put, Body } from '@nestjs/common'
import { GeneralParamsService } from './general-params.service'
import { UpdateGeneralParamDto } from './dto/update-general-param.dto'
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator'

@Controller('general-params')
export class GeneralParamsController {
  constructor(private readonly service: GeneralParamsService) {}

  @Get()
  findAll() {
    return this.service.findAll()
  }

  @Put(':key')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateGeneralParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(key, dto.value, user.id)
  }
}
