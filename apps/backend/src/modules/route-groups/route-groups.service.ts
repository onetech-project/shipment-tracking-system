import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { originLabel } from '../../common/utils/origin-labels.util'
import { RouteGroupEntity } from './entities/route-group.entity'
import { RouteGroupRouteEntity } from './entities/route-group-route.entity'

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
}
