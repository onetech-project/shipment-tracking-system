import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { RouteSimulationScenarioEntity } from './entities/route-simulation-scenario.entity'
import { CreateScenarioDto, UpdateScenarioDto } from './dto/save-scenario.dto'
import { ScenarioDetail, ScenarioSummary } from './route-simulation.types'

const UNIQUE_VIOLATION = '23505'
const NAME_UNIQUE_CONSTRAINT = 'uq_route_simulation_scenarios_name'
// A full scenario (dozens of accounts, every lane edited) serialises to a few tens of KB. Kept under
// the 100 KB default JSON body limit of main.ts so an oversized save gets this clear 413 rather
// than the body parser's generic one.
const MAX_PAYLOAD_BYTES = 90 * 1024

const SELECT_COLUMNS = `
  s.id, s.name, s.description, s.revision, s.updated_at, u.username
`

@Injectable()
export class RouteSimulationScenariosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(RouteSimulationScenarioEntity)
    private readonly repo: Repository<RouteSimulationScenarioEntity>,
  ) {}

  // Summaries only: the list feeds a dropdown, and payloads are fetched one at a time on open.
  async findAll(): Promise<ScenarioSummary[]> {
    const rows = await this.dataSource.query(`
      SELECT ${SELECT_COLUMNS}
      FROM route_simulation_scenarios s
      LEFT JOIN users u ON u.id = s.updated_by
      ORDER BY s.updated_at DESC, s.name
    `)
    return (rows as Record<string, unknown>[]).map((r) => this.toSummary(r))
  }

  async findOne(id: string): Promise<ScenarioDetail> {
    const rows = await this.dataSource.query(
      `
      SELECT ${SELECT_COLUMNS}, s.payload
      FROM route_simulation_scenarios s
      LEFT JOIN users u ON u.id = s.updated_by
      WHERE s.id = $1
      `,
      [id],
    )
    if (!rows.length) throw new NotFoundException(`Scenario ${id} not found`)
    return { ...this.toSummary(rows[0]), payload: rows[0].payload as Record<string, unknown> }
  }

  async create(dto: CreateScenarioDto, userId: string): Promise<ScenarioDetail> {
    this.assertPayloadSize(dto.payload)
    const name = dto.name.trim()
    await this.assertNameFree(name)
    try {
      const saved = await this.repo.save(
        this.repo.create({
          name,
          description: this.normalizeDescription(dto.description),
          payload: dto.payload,
          revision: 1,
          updatedBy: userId,
        }),
      )
      return this.findOne(saved.id)
    } catch (err) {
      this.throwIfNameUniqueViolation(err, name)
      throw err
    }
  }

  // The revision check is inside the UPDATE's WHERE, so check-and-write is one atomic statement:
  // two saves racing on the same revision cannot both succeed.
  async update(id: string, dto: UpdateScenarioDto, userId: string): Promise<ScenarioDetail> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException(`Scenario ${id} not found`)
    if (dto.payload) this.assertPayloadSize(dto.payload)

    const name = dto.name?.trim()
    if (name && name !== existing.name) await this.assertNameFree(name, id)

    const sets: string[] = ['revision = revision + 1', 'updated_at = now()', 'updated_by = $3']
    const params: unknown[] = [id, dto.revision, userId]
    const bind = (v: unknown) => {
      params.push(v)
      return `$${params.length}`
    }
    if (name) sets.push(`name = ${bind(name)}`)
    if (dto.description !== undefined) {
      sets.push(`description = ${bind(this.normalizeDescription(dto.description))}`)
    }
    if (dto.payload) sets.push(`payload = ${bind(JSON.stringify(dto.payload))}::jsonb`)

    let updated: unknown[]
    try {
      updated = await this.dataSource.query(
        `UPDATE route_simulation_scenarios SET ${sets.join(', ')}
         WHERE id = $1 AND revision = $2
         RETURNING id`,
        params,
      )
    } catch (err) {
      this.throwIfNameUniqueViolation(err, name ?? existing.name)
      throw err
    }
    if (!updated.length) {
      throw new ConflictException(
        'This scenario was saved by someone else after you opened it. Reload it before saving.',
      )
    }
    return this.findOne(id)
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete({ id })
    if (!res.affected) throw new NotFoundException(`Scenario ${id} not found`)
  }

  private toSummary(r: Record<string, unknown>): ScenarioSummary {
    return {
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      revision: Number(r.revision),
      updatedAt: new Date(r.updated_at as string | Date).toISOString(),
      updatedBy: (r.username as string | null) ?? null,
    }
  }

  private assertPayloadSize(payload: Record<string, unknown>): void {
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException('Scenario payload exceeds 90 KB')
    }
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const clash = await this.repo.findOne({ where: { name } })
    if (clash && clash.id !== exceptId) {
      throw new ConflictException(`A scenario named "${name}" already exists`)
    }
  }

  private normalizeDescription(description?: string | null): string | null {
    if (description == null) return null
    const trimmed = description.trim()
    return trimmed === '' ? null : trimmed
  }

  private throwIfNameUniqueViolation(err: unknown, name: string): void {
    const pgErr = err as { code?: string; constraint?: string }
    if (pgErr?.code === UNIQUE_VIOLATION && pgErr?.constraint === NAME_UNIQUE_CONSTRAINT) {
      throw new ConflictException(`A scenario named "${name}" already exists`)
    }
  }
}
