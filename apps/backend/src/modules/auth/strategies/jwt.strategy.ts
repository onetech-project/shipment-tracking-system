import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { JwtPayload } from '@shared/auth'
import { User } from '../../users/entities/user.entity'
import { UserRole } from '../../roles/entities/user-role.entity'
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserRole) private readonly userRoleRepo: Repository<UserRole>
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    })
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } })

    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    if (!user.isSuperAdmin) {
      if (!user.isActive) {
        throw new UnauthorizedException('Account is not active')
      }
      if (user.isLocked) {
        throw new UnauthorizedException('Account is locked')
      }
    }

    const userRoles = payload.org_id
      ? await this.userRoleRepo.find({
          where: { userId: user.id, organizationId: payload.org_id },
          relations: ['role'],
        })
      : []

    return {
      id: user.id,
      username: user.username,
      organizationId: payload.org_id,
      isSuperAdmin: user.isSuperAdmin,
      roles: userRoles.map((ur) => ur.role?.name).filter(Boolean) as string[],
      permissions: payload.permissions || [],
    }
  }
}
