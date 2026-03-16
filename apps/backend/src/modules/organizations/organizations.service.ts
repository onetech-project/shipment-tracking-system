import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Organization } from './entities/organization.entity';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { AuthService } from '../auth/auth.service';
import { generateSlug, ensureUniqueSlug } from '../../common/utils/slug.util';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
    private readonly authService: AuthService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(): Promise<Organization[]> {
    return this.orgRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const existing = await this.orgRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Organization name already exists');
    const baseSlug = generateSlug(dto.name);
    const slug = await ensureUniqueSlug(baseSlug, this.orgRepo);
    const org = this.orgRepo.create({ name: dto.name, address: dto.address, slug });
    const saved = await this.orgRepo.save(org);
    this.eventEmitter.emit('organization.created', { organizationId: saved.id });
    return saved;
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const org = await this.findOne(id);
    Object.assign(org, dto);
    const saved = await this.orgRepo.save(org);
    this.eventEmitter.emit('organization.updated', { organizationId: id });
    return saved;
  }

  async deactivate(id: string, actorId: string): Promise<void> {
    const org = await this.findOne(id);
    org.isActive = false;
    await this.orgRepo.save(org);
    await this.authService.revokeAllTokens(actorId);
    this.eventEmitter.emit('organization.deactivated', { organizationId: id, actorId });
  }
}
