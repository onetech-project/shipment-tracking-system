import { Entity, Column, PrimaryColumn } from 'typeorm'

// Composite primary key across all three columns: a route may appear in many groups, and a group
// may hold many routes, but the same route twice in one group is meaningless.
@Entity('route_group_routes')
export class RouteGroupRouteEntity {
  @PrimaryColumn({ name: 'route_group_id', type: 'uuid' })
  routeGroupId: string

  @PrimaryColumn({ name: 'origin_station', length: 100 })
  originStation: string

  @PrimaryColumn({ name: 'dest_station', length: 100 })
  destStation: string
}
