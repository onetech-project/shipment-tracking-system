import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Request, Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { Public } from '../../common/decorators/public.decorator'
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator'
import { LoginDto } from './dto/login.dto'
import { RefreshToken } from './entities/refresh-token.entity'

const REFRESH_COOKIE = 'refresh_token'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const { accessToken, refreshToken, user } = await this.authService.login(
      dto.username,
      dto.password,
      req.ip,
      req.headers['user-agent']
    )
    this.setRefreshCookie(res, refreshToken)
    return { accessToken, user }
  }

  @Public()
  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { tokenRecord, userId } = req.user as { tokenRecord: RefreshToken; userId: string }
    const { accessToken, refreshToken } = await this.authService.refreshToken(
      tokenRecord,
      userId,
      req.ip,
      req.headers['user-agent']
    )
    this.setRefreshCookie(res, refreshToken)
    return { accessToken }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const rawToken: string | undefined = req.cookies?.[REFRESH_COOKIE]
    if (rawToken) {
      const crypto = await import('crypto')
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex')
      await this.authService.logout(user.id, hash)
    }
    res.clearCookie(REFRESH_COOKIE)
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser
  ) {
    await this.authService.logoutAll(user.id)
    res.clearCookie(REFRESH_COOKIE)
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return user
  }

  private setRefreshCookie(res: Response, token: string) {
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d')
    const maxAge = this.parseToMs(expiresIn)
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge,
      path: '/api/auth',
    })
  }

  private parseToMs(value: string): number {
    const match = value.match(/^(\d+)([smhd])$/)
    if (!match) return 7 * 24 * 60 * 60 * 1000
    const [, amount, unit] = match
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    }
    return parseInt(amount, 10) * multipliers[unit]
  }
}
