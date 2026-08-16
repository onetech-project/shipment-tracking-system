import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { originLabel } from '../../common/utils/origin-labels.util'
import { RouteGroupEntity } from './entities/route-group.entity'
import { RouteGroupRouteEntity } from './entities/route-group-route.entity'
import { CreateRouteGroupDto } from './dto/create-route-group.dto'
import { UpdateRouteGroupDto } from './dto/update-route-group.dto'

export interface RouteGroupRoute {
  origin: string // raw station value, e.g. 'Jabo'
  originLabel: string // display label, e.g. 'CGK'
  dest: string
}

export interface AvailableRoute extends RouteGroupRoute {
  hasData: boolean // the pair appears in v_pnl_to; false means a group holding it renders empty
}

export interface RouteGroup {
  id: string
  name: string
  description: string | null
  routes: RouteGroupRoute[]
}

const UNIQUE_VIOLATION = '23505'
const NAME_UNIQUE_CONSTRAINT = 'uq_route_groups_name'

@Injectable()
export class RouteGroupsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(RouteGroupEntity)
    private readonly groupRepo: Repository<RouteGroupEntity>,
    @InjectRepository(RouteGroupRouteEntity)
    private readonly routeRepo: Repository<RouteGroupRouteEntity>,
  ) {}

  // Selectable routes come from the DC-pair master rather than from v_pnl_to, so a route can be
  // put into a group before its first shipment ever lands. Measured on the current database the
  // master yields 31 station pairs and covers all 18 that carry shipments, so nothing with data
  // is unselectable. hasData marks the remainder, which would render as an all-em-dash column.
  async getAvailableRoutes(): Promise<AvailableRoute[]> {
    const rows = await this.dataSource.query(`
      WITH master AS (
        SELECT DISTINCT
          NULLIF(BTRIM(extra_fields->>'origin_station'), '')      AS origin,
          NULLIF(BTRIM(extra_fields->>'destination_station'), '') AS dest
        FROM air_shipments_data
        WHERE service = 'Air'
      ),
      used AS (
        SELECT DISTINCT origin_station AS origin, dest_station AS dest
        FROM v_pnl_to
        WHERE origin_station IS NOT NULL AND dest_station IS NOT NULL
      )
      SELECT m.origin, m.dest, (u.origin IS NOT NULL) AS has_data
      FROM master m
      LEFT JOIN used u ON u.origin = m.origin AND u.dest = m.dest
      WHERE m.origin IS NOT NULL AND m.dest IS NOT NULL
      ORDER BY 1, 2
    `)

    return (rows as { origin: string; dest: string; has_data: boolean }[]).map((r) => ({
      origin: r.origin,
      originLabel: originLabel(r.origin),
      dest: r.dest,
      hasData: r.has_data,
    }))
  }

  // One query rather than a TypeORM relation load: the row count is tiny and a flat join keeps
  // route ordering under this method's control.
  async findAll(): Promise<RouteGroup[]> {
    const rows = await this.dataSource.query(`
      SELECT g.id, g.name, g.description, r.origin_station AS origin, r.dest_station AS dest
      FROM route_groups g
      LEFT JOIN route_group_routes r ON r.route_group_id = g.id
      ORDER BY g.name, r.origin_station, r.dest_station
    `)

    const byId = new Map<string, RouteGroup>()
    for (const row of rows as Record<string, string | null>[]) {
      const id = row.id as string
      let group = byId.get(id)
      if (!group) {
        group = { id, name: row.name as string, description: row.description, routes: [] }
        byId.set(id, group)
      }
      // LEFT JOIN yields a single all-null route for a group whose routes were removed.
      if (row.origin && row.dest) {
        group.routes.push({
          origin: row.origin,
          originLabel: originLabel(row.origin),
          dest: row.dest,
        })
      }
    }
    return [...byId.values()]
  }

  async create(dto: CreateRouteGroupDto): Promise<RouteGroup> {
    await this.assertRoutesExist(dto.routes)
    await this.assertNameFree(dto.name)

    let groupId: string
    try {
      groupId = await this.dataSource.transaction(async (manager) => {
        const groupRepo = manager.getRepository(RouteGroupEntity)
        const group = await groupRepo.save(
          groupRepo.create({
            name: dto.name,
            description: this.normalizeDescription(dto.description),
          }),
        )
        await this.replaceRoutes(manager, group.id, dto.routes)
        return group.id
      })
    } catch (err: unknown) {
      this.throwIfNameUniqueViolation(err, dto.name)
      throw err
    }

    return this.findOneOrThrow(groupId)
  }

  async update(id: string, dto: UpdateRouteGroupDto): Promise<RouteGroup> {
    const existing = await this.groupRepo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Route group not found')

    if (dto.routes) await this.assertRoutesExist(dto.routes)
    if (dto.name && dto.name !== existing.name) await this.assertNameFree(dto.name)

    try {
      await this.dataSource.transaction(async (manager) => {
        const patch: Partial<Pick<RouteGroupEntity, 'name' | 'description'>> = {}
        if (dto.name) patch.name = dto.name
        if (dto.description !== undefined) {
          patch.description = this.normalizeDescription(dto.description)
        }
        if (Object.keys(patch).length > 0) {
          await manager.getRepository(RouteGroupEntity).update(id, patch)
        }
        if (dto.routes) await this.replaceRoutes(manager, id, dto.routes)
      })
    } catch (err: unknown) {
      this.throwIfNameUniqueViolation(err, dto.name ?? existing.name)
      throw err
    }

    return this.findOneOrThrow(id)
  }

  async remove(id: string): Promise<void> {
    const existing = await this.groupRepo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Route group not found')
    // route_group_routes rows go with it via ON DELETE CASCADE.
    await this.groupRepo.delete(id)
  }

  private async findOneOrThrow(id: string): Promise<RouteGroup> {
    const group = (await this.findAll()).find((g) => g.id === id)
    if (!group) throw new NotFoundException('Route group not found')
    return group
  }

  private async assertNameFree(name: string): Promise<void> {
    const clash = await this.groupRepo.findOne({ where: { name } })
    if (clash) throw new ConflictException(`A route group named "${name}" already exists`)
  }

  // Rejects a route the DC-pair master has never heard of: it could never produce a number, so
  // storing it would only create a column of em-dashes nobody can explain.
  private async assertRoutesExist(routes: { origin: string; dest: string }[]): Promise<void> {
    const available = await this.getAvailableRoutes()
    const known = new Set(available.map((r) => `${r.origin}|${r.dest}`))
    for (const route of routes) {
      if (!known.has(`${route.origin}|${route.dest}`)) {
        throw new ConflictException(`Unknown route: ${route.origin} → ${route.dest}`)
      }
    }
  }

  // Deletes and re-inserts within the caller's transaction so a group write and its route rows
  // commit or roll back together. Routes are de-duplicated first: the composite primary key on
  // route_group_routes means sending the same pair twice would otherwise throw partway through the
  // insert, after the delete has already committed, leaving the group routeless.
  private async replaceRoutes(
    manager: EntityManager,
    groupId: string,
    routes: { origin: string; dest: string }[],
  ): Promise<void> {
    const routeRepo = manager.getRepository(RouteGroupRouteEntity)
    const unique = this.dedupeRoutes(routes)

    await routeRepo.delete({ routeGroupId: groupId })
    await routeRepo.insert(
      unique.map((r) => ({
        routeGroupId: groupId,
        originStation: r.origin,
        destStation: r.dest,
      })),
    )
  }

  private dedupeRoutes<T extends { origin: string; dest: string }>(routes: T[]): T[] {
    const seen = new Set<string>()
    const result: T[] = []
    for (const route of routes) {
      const key = `${route.origin}|${route.dest}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push(route)
    }
    return result
  }

  // '' and whitespace-only are folded into null so the column has one empty state instead of two.
  private normalizeDescription(description?: string | null): string | null {
    if (description == null) return null
    const trimmed = description.trim()
    return trimmed === '' ? null : trimmed
  }

  // The check-then-act in assertNameFree still leaves a race between two concurrent creates/renames;
  // this catches the loser's constraint violation and reshapes it into the same ConflictException the
  // pre-check produces, so both paths look identical to the caller instead of surfacing a raw 500.
  private throwIfNameUniqueViolation(err: unknown, name: string): void {
    const pgErr = err as { code?: string; constraint?: string }
    if (pgErr?.code === UNIQUE_VIOLATION && pgErr?.constraint === NAME_UNIQUE_CONSTRAINT) {
      throw new ConflictException(`A route group named "${name}" already exists`)
    }
  }
}
