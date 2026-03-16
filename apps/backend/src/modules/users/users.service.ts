import { Injectable, NotFoundException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { Profile } from '../organizations/entities/profile.entity';
import { UserRole } from '../roles/entities/user-role.entity';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, AdminResetPasswordDto } from './dto/user.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Profile) private readonly profileRepo: Repository<Profile>,
    @InjectRepository(UserRole) private readonly urRepo: Repository<UserRole>,
    private readonly authService: AuthService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(requestingUser: Pick<AuthenticatedUser, 'organizationId' | 'isSuperAdmin'>): Promise<User[]> {
    if (requestingUser.isSuperAdmin) {
      return this.userRepo
        .createQueryBuilder('u')
        .select(['u.id', 'u.username', 'u.isActive', 'u.isLocked', 'u.lastLoginAt', 'u.createdAt'])
        .getMany();
    }
    return this.userRepo
      .createQueryBuilder('u')
      .innerJoin('user_roles', 'ur', 'ur.user_id = u.id AND ur.organization_id = :organizationId', { organizationId: requestingUser.organizationId })
      .select(['u.id', 'u.username', 'u.isActive', 'u.isLocked', 'u.lastLoginAt', 'u.createdAt'])
      .getMany();
  }

  async findOne(id: string, organizationId: string): Promise<User & { profile?: Profile }> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const profile = await this.profileRepo.findOne({ where: { userId: id, organizationId } });
    return Object.assign(user, { profile });
  }

  async create(dto: CreateUserDto, organizationId: string, actorId: string): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { username: dto.username } });
    if (existing) throw new ConflictException('Username already taken');
    const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({ username: dto.username, password, isActive: true });
    const saved = await this.userRepo.save(user);
    // Create profile
    const profile = this.profileRepo.create({
      userId: saved.id,
      organizationId,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    await this.profileRepo.save(profile);
    this.eventEmitter.emit('user.created', { userId: saved.id, organizationId, actorId });
    return saved;
  }

  async update(id: string, dto: UpdateUserDto, organizationId: string, actorId: string): Promise<Profile> {
    const profile = await this.profileRepo.findOne({ where: { userId: id, organizationId } });
    if (!profile) throw new NotFoundException('User profile not found');
    Object.assign(profile, dto);
    const saved = await this.profileRepo.save(profile);
    this.eventEmitter.emit('user.updated', { userId: id, organizationId, actorId });
    return saved;
  }

  async inactivate(id: string, organizationId: string, actorId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = false;
    await this.userRepo.save(user);
    await this.authService.revokeAllTokens(id);
    this.eventEmitter.emit('user.inactivated', { userId: id, organizationId, actorId });
  }

  async deactivate(id: string, organizationId: string, actorId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = false;
    await this.userRepo.save(user);
    await this.authService.revokeAllTokens(id);
    this.eventEmitter.emit('user.deactivated', { userId: id, organizationId, actorId });
  }

  async changePassword(id: string, dto: ChangePasswordDto, actorId: string): Promise<void> {
    if (id !== actorId) throw new ForbiddenException('Cannot change another user\'s password');
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    user.password = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    user.requirePasswordReset = false;
    await this.userRepo.save(user);
    await this.authService.revokeAllTokens(id);
    this.eventEmitter.emit('user.password_changed', { userId: id, actorId });
  }

  async adminResetPassword(id: string, dto: AdminResetPasswordDto, organizationId: string, actorId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.password = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    user.requirePasswordReset = dto.requireChange ?? true;
    user.isLocked = false;
    user.lockedAt = null;
    user.failedAttempts = 0;
    await this.userRepo.save(user);
    await this.authService.revokeAllTokens(id);
    this.eventEmitter.emit('user.password_reset', { userId: id, organizationId, actorId });
  }

  async unlockUser(id: string, organizationId: string, actorId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.isLocked = false;
    user.lockedAt = null;
    user.failedAttempts = 0;
    await this.userRepo.save(user);
    this.eventEmitter.emit('user.unlocked', { userId: id, organizationId, actorId });
  }
}
