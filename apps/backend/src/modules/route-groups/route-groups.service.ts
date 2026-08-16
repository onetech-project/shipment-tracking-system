import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
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

    const group = await this.groupRepo.save(
      this.groupRepo.create({ name: dto.name, description: dto.description ?? null }),
    )
    await this.replaceRoutes(group.id, dto.routes)
    return this.findOneOrThrow(group.id)
  }

  async update(id: string, dto: UpdateRouteGroupDto): Promise<RouteGroup> {
    const existing = await this.groupRepo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Route group not found')

    if (dto.routes) await this.assertRoutesExist(dto.routes)
    if (dto.name && dto.name !== existing.name) await this.assertNameFree(dto.name)

    await this.groupRepo.update(id, {
      ...(dto.name ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
    })
    if (dto.routes) await this.replaceRoutes(id, dto.routes)
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

  private async replaceRoutes(
    groupId: string,
    routes: { origin: string; dest: string }[],
  ): Promise<void> {
    await this.routeRepo.delete({ routeGroupId: groupId })
    await this.routeRepo.insert(
      routes.map((r) => ({
        routeGroupId: groupId,
        originStation: r.origin,
        destStation: r.dest,
      })),
    )
  }
}
