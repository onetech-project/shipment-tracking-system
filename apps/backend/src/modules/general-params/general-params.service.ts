import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Repository } from 'typeorm'
import { GeneralParam } from './entities/general-param.entity'

@Injectable()
export class GeneralParamsService {
  constructor(
    @InjectRepository(GeneralParam)
    private readonly repo: Repository<GeneralParam>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(): Promise<GeneralParam[]> {
    return this.repo.find({ order: { key: 'ASC' } })
  }

  async getValue(key: string, fallback = '0'): Promise<string> {
    const row = await this.repo.findOneBy({ key })
    return row?.value ?? fallback
  }

  async update(key: string, value: string, actorId?: string): Promise<GeneralParam> {
    await this.repo.update({ key }, { value })
    this.eventEmitter.emit('general_params.updated', { key, value, actorId })
    return this.repo.findOneByOrFail({ key })
  }

  /**
   * Updates an existing param or creates it if missing — used for single app-wide configs
   * that may not be pre-seeded. Emits the same audit event as `update`.
   */
  async upsert(key: string, value: string, label: string, actorId?: string): Promise<GeneralParam> {
    const existing = await this.repo.findOneBy({ key })
    if (existing) {
      await this.repo.update({ key }, { value })
    } else {
      await this.repo.insert({ key, value, label })
    }
    this.eventEmitter.emit('general_params.updated', { key, value, actorId })
    return this.repo.findOneByOrFail({ key })
  }
}
