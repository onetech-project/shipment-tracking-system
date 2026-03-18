import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, IsNull } from 'typeorm'
import { ConfigService } from '@nestjs/config'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { EventEmitter2 } from '@nestjs/event-emitter'
import * as crypto from 'crypto'
import * as bcrypt from 'bcrypt'
import { Invitation } from './entities/invitation.entity'
import { CreateInvitationDto, AcceptInvitationDto } from './dto/invitation.dto'
import { User } from '../users/entities/user.entity'
import { Profile } from '../organizations/entities/profile.entity'
import { UserRole } from '../roles/entities/user-role.entity'

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation) private readonly invitationRepo: Repository<Invitation>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Profile) private readonly profileRepo: Repository<Profile>,
    @InjectRepository(UserRole) private readonly userRoleRepo: Repository<UserRole>,
    private readonly config: ConfigService,
    @InjectQueue('email') private readonly emailQueue: Queue,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async create(
    dto: CreateInvitationDto,
    organizationId: string,
    invitedBy: string
  ): Promise<Invitation> {
    const existing = await this.invitationRepo.findOne({
      where: { email: dto.email, organizationId, status: 'pending' },
    })
    if (existing) throw new ConflictException('Pending invitation already exists for this email')

    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiryHours = this.config.get<number>('INVITATION_EXPIRY_HOURS', 72)
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000)

    const invitation = this.invitationRepo.create({
      email: dto.email,
      invitedName: dto.name,
      organizationId,
      invitedBy,
      roleId: dto.roleId,
      tokenHash,
      expiresAt,
      status: 'pending',
    })
    const saved = await this.invitationRepo.save(invitation)

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000')
    await this.emailQueue.add('send-invitation', {
      to: dto.email,
      invitationUrl: `${appUrl}/invite/accept?token=${rawToken}`,
      organizationId,
    })

    this.eventEmitter.emit('invitation.created', {
      invitationId: saved.id,
      organizationId,
      actorId: invitedBy,
    })
    return saved
  }

  async findAll(organizationId: string): Promise<Invitation[]> {
    return this.invitationRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    })
  }

  async cancel(id: string, actorId: string): Promise<void> {
    try {
      const invitation = await this.invitationRepo.findOne({ where: { id } })
      if (!invitation) throw new NotFoundException('Invitation not found')
      if (invitation.status !== 'pending')
        throw new BadRequestException('Invitation is not pending')
      invitation.status = 'revoked'
      await this.invitationRepo.save(invitation)
      this.eventEmitter.emit('invitation.revoked', {
        invitationId: id,
        organizationId: invitation.organizationId,
        actorId,
      })
    } catch (error) {
      console.error('Error cancelling invitation:', error)
      throw error
    }
  }

  async accept(dto: AcceptInvitationDto): Promise<{ message: string }> {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex')

    const invitation = await this.invitationRepo.findOne({
      where: { tokenHash, status: 'pending' },
    })
    if (!invitation || invitation.expiresAt < new Date()) {
      throw new BadRequestException('INVALID_OR_EXPIRED_INVITATION')
    }

    const existingUser = await this.userRepo.findOne({ where: { username: dto.username } })
    if (existingUser) throw new ConflictException('Username already taken')

    const hashedPassword = await bcrypt.hash(dto.password, 12)
    const user = this.userRepo.create({
      username: dto.username,
      password: hashedPassword,
      isActive: true,
    })
    const savedUser = await this.userRepo.save(user)

    const profile = this.profileRepo.create({
      userId: savedUser.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      name: invitation.invitedName,
    })
    await this.profileRepo.save(profile)

    if (invitation.roleId) {
      const userRole = this.userRoleRepo.create({
        userId: savedUser.id,
        roleId: invitation.roleId,
        organizationId: invitation.organizationId,
        assignedAt: new Date(),
        assignedBy: invitation.invitedBy,
      })
      await this.userRoleRepo.save(userRole)
    }

    invitation.status = 'accepted'
    invitation.usedAt = new Date()
    await this.invitationRepo.save(invitation)

    this.eventEmitter.emit('invitation.accepted', {
      invitationId: invitation.id,
      userId: savedUser.id,
      organizationId: invitation.organizationId,
    })

    return { message: 'Account created successfully. You can now log in.' }
  }
}
