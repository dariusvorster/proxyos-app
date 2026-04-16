export interface JWTConfig {
  jwksUrl: string
  issuer?: string
  audience?: string
  algorithms: string[]      // e.g. ['RS256']
  extractClaims: string[]   // forwarded as X-JWT-{Claim} headers
  skipPaths: string[]       // paths that don't require JWT
}

/**
 * Builds Caddy `jwtauth` handler config for JWT validation.
 * Requires caddy-security or caddy-jwt plugin.
 */
export function buildJWTHandler(config: JWTConfig): Record<string, unknown> {
  return {
    handler: 'authenticate',
    providers: {
      jwt: {
        trusted_tokens: [{ static_secret: false, token_sources: ['header'] }],
        auth_url_path: '/auth/portal',
        primary: true,
        jwks_uri: config.jwksUrl,
        token_name: 'access_token',
        ...(config.issuer ? { token_validator: { iss: [config.issuer] } } : {}),
        ...(config.audience ? { token_validator: { aud: [config.audience] } } : {}),
        allow_claims_from_path: config.skipPaths,
      },
    },
  }
}

/**
 * Builds Caddy `header` handler to inject extracted JWT claims as upstream headers.
 */
export function buildClaimForwardingHandler(claims: string[]): Record<string, unknown> {
  if (claims.length === 0) return {}
  const add: Record<string, string> = {}
  for (const claim of claims) {
    add[`X-JWT-${claim.charAt(0).toUpperCase() + claim.slice(1)}`] = `{http.auth.user.${claim}}`
  }
  return { handler: 'headers', request: { add } }
}

export function parseJWTConfig(json: string | null | undefined): JWTConfig | null {
  if (!json) return null
  try { return JSON.parse(json) as JWTConfig } catch { return null }
}
