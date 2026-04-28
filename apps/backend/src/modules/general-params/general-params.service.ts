import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { GeneralParam } from './entities/general-param.entity'

@Injectable()
export class GeneralParamsService {
  constructor(
    @InjectRepository(GeneralParam)
    private readonly repo: Repository<GeneralParam>
  ) {}

  findAll(): Promise<GeneralParam[]> {
    return this.repo.find({ order: { key: 'ASC' } })
  }

  async getValue(key: string, fallback = '0'): Promise<string> {
    const row = await this.repo.findOneBy({ key })
    return row?.value ?? fallback
  }

  async update(key: string, value: string): Promise<GeneralParam> {
    await this.repo.update({ key }, { value })
    return this.repo.findOneByOrFail({ key })
  }
}
