import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { Invitation } from './entities/invitation.entity';
import { CreateInvitationDto } from './dto/invitation.dto';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation) private readonly invitationRepo: Repository<Invitation>,
    private readonly config: ConfigService,
    @InjectQueue('email') private readonly emailQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateInvitationDto, organizationId: string, invitedBy: string): Promise<Invitation> {
    const existing = await this.invitationRepo.findOne({
      where: { email: dto.email, organizationId, status: 'pending' },
    });
    if (existing) throw new ConflictException('Pending invitation already exists for this email');

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiryHours = this.config.get<number>('INVITATION_EXPIRY_HOURS', 72);
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const invitation = this.invitationRepo.create({
      email: dto.email,
      invitedName: dto.name,
      organizationId,
      invitedBy,
      roleId: dto.roleId,
      tokenHash,
      expiresAt,
      status: 'pending',
    });
    const saved = await this.invitationRepo.save(invitation);

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    await this.emailQueue.add('send-invitation', {
      to: dto.email,
      invitationUrl: `${appUrl}/invite/accept?token=${rawToken}`,
      organizationId,
    });

    this.eventEmitter.emit('invitation.created', { invitationId: saved.id, organizationId, actorId: invitedBy });
    return saved;
  }

  async findAll(organizationId: string): Promise<Invitation[]> {
    return this.invitationRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async cancel(id: string, organizationId: string, actorId: string): Promise<void> {
    const invitation = await this.invitationRepo.findOne({ where: { id, organizationId } });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'pending') throw new BadRequestException('Invitation is not pending');
    invitation.status = 'cancelled';
    await this.invitationRepo.save(invitation);
    this.eventEmitter.emit('invitation.cancelled', { invitationId: id, organizationId, actorId });
  }

  async accept(rawToken: string): Promise<Invitation> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const result = await this.invitationRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'accepted', usedAt: new Date() })
      .where('token_hash = :tokenHash', { tokenHash })
      .andWhere('status = :status', { status: 'pending' })
      .andWhere('expires_at > NOW()')
      .andWhere('used_at IS NULL')
      .returning('*')
      .execute();

    if (!result.affected || result.affected === 0) {
      throw new BadRequestException('INVALID_OR_EXPIRED_INVITATION');
    }
    return result.raw[0] as Invitation;
  }
}
