export interface CaddyMatcher {
  host?: string[]
  path?: string[]
}

export interface CaddyHandler {
  handler: string
  [key: string]: unknown
}

export interface CaddyRoute {
  '@id'?: string
  match?: CaddyMatcher[]
  handle: CaddyHandler[]
  terminal?: boolean
}

export interface CaddyUpstream {
  dial: string
}
