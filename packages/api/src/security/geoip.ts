export interface GeoIPConfig {
  mode: 'allowlist' | 'blocklist'
  countries: string[]     // ISO 3166-1 alpha-2 e.g. ['CN', 'RU', 'KP']
  action: 'block' | 'challenge'
}

// High-risk country preset (commonly abused)
export const HIGH_RISK_COUNTRIES = ['CN', 'RU', 'KP', 'IR', 'BY', 'SY', 'CU', 'VE']

/**
 * Builds a Caddy route snippet for GeoIP blocking.
 * Requires Caddy with MaxMind GeoIP module (caddy-geoip or caddy-maxmind-geolocation).
 * The actual IP→country lookup happens in Caddy — ProxyOS just generates the config.
 */
export function buildGeoIPMatcher(config: GeoIPConfig): Record<string, unknown> {
  if (config.countries.length === 0) return {}

  if (config.mode === 'blocklist') {
    return {
      match: [{ remote_ip: { ranges: [] }, geoip: { countries: config.countries } }],
      handle: [{ handler: 'static_response', status_code: 403, body: 'Access denied by geographic restriction.' }],
      terminal: true,
    }
  }

  // allowlist: block everyone NOT in the list
  return {
    match: [{ not: [{ geoip: { countries: config.countries } }] }],
    handle: [{ handler: 'static_response', status_code: 403, body: 'Access restricted to specific regions.' }],
    terminal: true,
  }
}

export function parseGeoIPConfig(json: string | null | undefined): GeoIPConfig | null {
  if (!json) return null
  try { return JSON.parse(json) as GeoIPConfig } catch { return null }
}
