import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import * as crypto from 'crypto';
import { RefreshToken } from '../entities/refresh-token.entity';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    config: ConfigService,
    @InjectRepository(RefreshToken) private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly cfg: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.['refresh_token'] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: { sub: string; fid: string }) {
    const rawToken: string | undefined = req.cookies?.['refresh_token'];
    if (!rawToken) throw new UnauthorizedException('No refresh token');

    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const token = await this.refreshTokenRepo.findOne({ where: { tokenHash: hash } });
    if (!token) throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    if (token.revokedAt) throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    if (token.expiresAt < new Date()) throw new UnauthorizedException('INVALID_REFRESH_TOKEN');

    const inactivityMinutes = this.cfg.get<number>('SESSION_INACTIVITY_MINUTES', 30);
    const inactivityMs = inactivityMinutes * 60 * 1000;
    if (Date.now() - token.lastUsedAt.getTime() > inactivityMs) {
      throw new UnauthorizedException('SESSION_EXPIRED');
    }

    return { tokenRecord: token, userId: payload.sub };
  }
}
