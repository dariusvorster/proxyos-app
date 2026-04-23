import type { CaddyRoute } from './types'

// Caddy 2.11: Docker DNS is resolved automatically via container's
// /etc/resolv.conf (which Docker populates with 127.0.0.11). The
// per-route transport.resolvers field was rejected by Caddy 2.11
// ("unknown field resolvers"). Keep the function as a no-op so
// callers don't need to change.
export function applyDockerDns(route: CaddyRoute): CaddyRoute {
  return route
}
