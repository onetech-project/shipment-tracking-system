import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, IsNull, In } from 'typeorm'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import * as bcrypt from 'bcrypt'
import * as crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { User } from '../users/entities/user.entity'
import { RefreshToken } from './entities/refresh-token.entity'
import { Profile } from '../organizations/entities/profile.entity'
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '@shared/auth'
import { UserRole } from '../roles/entities/user-role.entity'
import { Role } from '../roles/entities/role.entity'

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken) private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(Profile) private readonly profileRepo: Repository<Profile>,
    @InjectRepository(UserRole) private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async login(
    username: string,
    password: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthenticatedUser }> {
    const user = await this.userRepo.findOne({ where: { username } })

    if (!user || !user.isActive) {
      throw new UnauthorizedException('INVALID_CREDENTIALS')
    }

    if (user.isLocked) {
      throw new ForbiddenException('ACCOUNT_LOCKED')
    }

    const passwordValid = await bcrypt.compare(password, user.password)
    if (!passwordValid) {
      const maxAttempts = this.config.get<number>('LOGIN_MAX_ATTEMPTS', 5)
      user.failedAttempts = (user.failedAttempts ?? 0) + 1
      if (user.failedAttempts >= maxAttempts) {
        user.isLocked = true
        user.lockedAt = new Date()
      }
      await this.userRepo.save(user)

      this.eventEmitter.emit('auth.login_failed', { userId: user.id, ip })
      throw new UnauthorizedException('INVALID_CREDENTIALS')
    }

    // Reset failed attempts on success
    user.failedAttempts = 0
    user.isLocked = false
    user.lockedAt = null
    user.lastLoginAt = new Date()
    await this.userRepo.save(user)

    // Resolve organization: null for super admins, from profile for regular users
    let organizationId: string | null = null
    if (!user.isSuperAdmin) {
      const profile = await this.profileRepo.findOne({ where: { userId: user.id } })
      organizationId = profile?.organizationId ?? null
    }

    const familyId = uuidv4()
    const { roleNames, permissions } = await this.getUserRoleAndPermissionNames(user.id)
    const { accessToken, refreshToken } = await this.issueTokenPair(
      user,
      roleNames,
      permissions,
      organizationId,
      familyId,
      ip,
      userAgent
    )

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      organizationId,
      isSuperAdmin: user.isSuperAdmin ?? false,
      roles: roleNames,
      permissions,
    }

    this.eventEmitter.emit('auth.login', { userId: user.id, organizationId, ip })

    return { accessToken, refreshToken, user: authenticatedUser }
  }

  async refreshToken(
    tokenRecord: RefreshToken,
    userId: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Revoke the old token
    tokenRecord.revokedAt = new Date()
    await this.refreshTokenRepo.save(tokenRecord)

    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user || !user.isActive) {
      throw new UnauthorizedException('USER_INACTIVE')
    }

    const { roleNames, permissions } = await this.getUserRoleAndPermissionNames(user.id)

    return this.issueTokenPair(
      user,
      roleNames,
      permissions,
      tokenRecord.organizationId,
      tokenRecord.familyId,
      ip,
      userAgent
    )
  }

  async logout(userId: string, tokenHash: string): Promise<void> {
    await this.refreshTokenRepo.update({ userId, tokenHash }, { revokedAt: new Date() })
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (user) {
      user.lastLogoutAt = new Date()
      await this.userRepo.save(user)
    }
    this.eventEmitter.emit('auth.logout', { userId })
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokenRepo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() })
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (user) {
      user.lastLogoutAt = new Date()
      await this.userRepo.save(user)
    }
    this.eventEmitter.emit('auth.logout_all', { userId })
  }

  async revokeAllTokens(userId: string): Promise<void> {
    await this.refreshTokenRepo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() })
  }

  private async issueTokenPair(
    user: User,
    roles: string[],
    permissions: string[],
    organizationId: string | null,
    familyId: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      org_id: organizationId,
      is_super_admin: user.isSuperAdmin ?? false,
      roles,
      permissions,
    }

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    })

    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d')
    const rawRefreshToken = this.jwtService.sign(
      { sub: user.id, fid: familyId },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn,
      }
    )
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex')
    const expiresAt = new Date(Date.now() + this.parseExpiry(refreshExpiresIn))

    const tokenEntity = this.refreshTokenRepo.create({
      userId: user.id,
      organizationId,
      tokenHash,
      familyId,
      expiresAt,
      lastUsedAt: new Date(),
      ipAddress: ip,
      userAgent,
    })
    await this.refreshTokenRepo.save(tokenEntity)

    return { accessToken, refreshToken: rawRefreshToken }
  }

  private parseExpiry(value: string): number {
    const match = value.match(/^(\d+)([smhd])$/)
    if (!match) return 7 * 24 * 60 * 60 * 1000
    const amount = parseInt(match[1], 10)
    const unit = match[2]
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    }
    return amount * multipliers[unit]
  }

  private async getUserRoleAndPermissionNames(
    userId: string
  ): Promise<{ roleNames: string[]; permissions: string[] }> {
    const userRoles = await this.userRoleRepo.find({
      where: { userId },
    })
    const roleIds = userRoles.map((ur) => ur.roleId)
    const roles = await this.roleRepo.find({
      where: { id: In(roleIds) },
      relations: ['rolePermissions', 'rolePermissions.permission'],
    })
    const roleNames = roles.map((r) => r.name)
    const permissions = roles.flatMap((r) => r.permissions.map((p) => p.name))
    return { roleNames, permissions }
  }
}
