export interface RouteGroupRoute {
  origin: string // raw station value, e.g. 'Jabo'
  originLabel: string // display label, e.g. 'CGK'
  dest: string
}

export interface AvailableRoute extends RouteGroupRoute {
  hasData: boolean // false = no shipment has ever flown this pair, so it renders as an empty column
}

export interface RouteGroup {
  id: string
  name: string
  description: string | null
  routes: RouteGroupRoute[]
}

// The write shape: the API only needs the raw pair, not the display label.
export interface RouteGroupPayload {
  name: string
  description?: string
  routes: { origin: string; dest: string }[]
}
