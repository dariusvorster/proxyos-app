// Directive registry + translators.
//
// Each nginx directive has a translator function that takes:
//   - the nginx directive AST node
//   - the translation context (current location, current server, accumulated state)
//
// And produces:
//   - zero or more caddy directives
//   - zero or more notes
//
// The registry is just a Map<directive name, translator>. Adding a new
// directive = adding an entry. The walker dispatches.

import type { CaddyDirective } from '../types/caddy-ast.ts'
import type { NginxDirective } from '../types/nginx-ast.ts'
import type { Note } from '../types/notes.ts'
import { substituteVariables } from './variables.ts'

export interface TranslationContext {
  // What kind of nginx parent we're inside ('server' | 'location' | 'http' | 'root')
  parentKind: string
  // For location blocks, the location path (used to scope handlers in caddy)
  currentLocationPath?: string
  // For location blocks, the match type (prefix | exact | regex)
  currentLocationMatch?: 'prefix' | 'exact' | 'regex'
  // Accumulated transport-level options (proxy_read_timeout, etc.) to merge
  // into the next reverse_proxy directive
  pendingTransport: TransportOpts
  // Accumulated headers (proxy_set_header) to merge into the next reverse_proxy
  pendingHeadersUp: Array<{ name: string; value: string }>
  pendingHeadersDown: Array<{ name: string; remove?: boolean }>
}

export interface TransportOpts {
  read_timeout?: string
  dial_timeout?: string
  write_timeout?: string
  versions?: string[]
  flush_interval?: string
}

export type Translator = (
  d: NginxDirective,
  ctx: TranslationContext,
) => { directives: CaddyDirective[]; notes: Note[] }

export interface TranslationOutput {
  directives: CaddyDirective[]
  notes: Note[]
}

// ============================================================================
// Translator helpers
// ============================================================================

function sub(s: string, dir: NginxDirective): { value: string; notes: Note[] } {
  const { result, unknownVariables } = substituteVariables(s)
  const notes: Note[] = unknownVariables.map((v) => ({
    severity: 'warning' as const,
    message: `Variable ${v} has no Caddy equivalent — translated to literal placeholder which won't resolve at runtime.`,
    position: dir.position,
    directive: dir.name,
  }))
  return { value: result, notes }
}

function info(message: string, dir: NginxDirective): Note {
  return { severity: 'info', message, position: dir.position, directive: dir.name }
}

function warn(message: string, dir: NginxDirective): Note {
  return { severity: 'warning', message, position: dir.position, directive: dir.name }
}

function error(message: string, dir: NginxDirective): Note {
  return { severity: 'error', message, position: dir.position, directive: dir.name }
}

// ============================================================================
// Translators
// ============================================================================

const proxyPass: Translator = (d, ctx) => {
  if (d.args.length !== 1) {
    return { directives: [], notes: [error(`proxy_pass requires exactly one argument`, d)] }
  }
  const upstream = d.args[0]
  const allNotes: Note[] = []

  // Build the reverse_proxy directive with accumulated transport opts and headers
  const rpBlock: CaddyDirective[] = []

  // Apply pending headers
  for (const h of ctx.pendingHeadersUp) {
    const subbed = sub(h.value, d)
    allNotes.push(...subbed.notes)
    rpBlock.push({ name: 'header_up', args: [h.name, subbed.value] })
  }
  for (const h of ctx.pendingHeadersDown) {
    rpBlock.push({
      name: 'header_down',
      args: h.remove ? ['-' + h.name] : [h.name],
    })
  }

  // Apply pending transport opts
  const transportOpts: CaddyDirective[] = []
  if (ctx.pendingTransport.read_timeout) {
    transportOpts.push({ name: 'read_timeout', args: [ctx.pendingTransport.read_timeout] })
  }
  if (ctx.pendingTransport.dial_timeout) {
    transportOpts.push({ name: 'dial_timeout', args: [ctx.pendingTransport.dial_timeout] })
  }
  if (ctx.pendingTransport.write_timeout) {
    transportOpts.push({ name: 'write_timeout', args: [ctx.pendingTransport.write_timeout] })
  }
  if (ctx.pendingTransport.versions) {
    transportOpts.push({ name: 'versions', args: ctx.pendingTransport.versions })
  }
  if (ctx.pendingTransport.flush_interval) {
    transportOpts.push({ name: 'flush_interval', args: [ctx.pendingTransport.flush_interval] })
  }
  if (transportOpts.length > 0) {
    rpBlock.push({ name: 'transport', args: ['http'], block: transportOpts })
  }

  // Reset accumulated state
  ctx.pendingHeadersUp = []
  ctx.pendingHeadersDown = []
  ctx.pendingTransport = {}

  const subbedUpstream = sub(upstream, d)
  allNotes.push(...subbedUpstream.notes)

  const reverseProxy: CaddyDirective = {
    name: 'reverse_proxy',
    args: [subbedUpstream.value],
    block: rpBlock.length > 0 ? rpBlock : undefined,
  }

  // Wrap in a `handle` block if we're inside a location
  if (ctx.currentLocationPath) {
    const handleArg = makeLocationHandleArg(ctx.currentLocationPath, ctx.currentLocationMatch ?? 'prefix')
    return {
      directives: [{ name: handleArg.handlerName, args: [handleArg.matcher], block: [reverseProxy] }],
      notes: allNotes,
    }
  }

  return { directives: [reverseProxy], notes: allNotes }
}

const proxySetHeader: Translator = (d, ctx) => {
  if (d.args.length !== 2) {
    return { directives: [], notes: [error(`proxy_set_header requires header name and value`, d)] }
  }
  const [name, value] = d.args
  // Stash it; gets emitted as part of the next reverse_proxy in this scope
  ctx.pendingHeadersUp.push({ name, value })
  return { directives: [], notes: [] }
}

const proxyHideHeader: Translator = (d, ctx) => {
  if (d.args.length !== 1) {
    return { directives: [], notes: [error(`proxy_hide_header requires header name`, d)] }
  }
  ctx.pendingHeadersDown.push({ name: d.args[0], remove: true })
  return { directives: [], notes: [] }
}

const proxyReadTimeout: Translator = (d, ctx) => {
  if (d.args.length !== 1) {
    return { directives: [], notes: [error(`proxy_read_timeout requires one argument`, d)] }
  }
  ctx.pendingTransport.read_timeout = d.args[0]
  return {
    directives: [],
    notes: [
      warn(
        `proxy_read_timeout ${d.args[0]} translated. Caddy default is 0 (no timeout). Verify behavior if upstream is slow.`,
        d,
      ),
    ],
  }
}

const proxyConnectTimeout: Translator = (d, ctx) => {
  if (d.args.length !== 1) {
    return { directives: [], notes: [error(`proxy_connect_timeout requires one argument`, d)] }
  }
  ctx.pendingTransport.dial_timeout = d.args[0]
  return { directives: [], notes: [] }
}

const proxySendTimeout: Translator = (d, ctx) => {
  if (d.args.length !== 1) {
    return { directives: [], notes: [error(`proxy_send_timeout requires one argument`, d)] }
  }
  ctx.pendingTransport.write_timeout = d.args[0]
  return { directives: [], notes: [] }
}

const proxyHttpVersion: Translator = (d, ctx) => {
  if (d.args.length !== 1) {
    return { directives: [], notes: [error(`proxy_http_version requires one argument`, d)] }
  }
  const v = d.args[0]
  if (v === '1.0') ctx.pendingTransport.versions = ['1.0']
  else if (v === '1.1') ctx.pendingTransport.versions = ['1.1']
  else if (v === '2.0') ctx.pendingTransport.versions = ['2']
  else return { directives: [], notes: [warn(`Unknown HTTP version ${v}`, d)] }
  return { directives: [], notes: [] }
}

const proxyBuffering: Translator = (d, ctx) => {
  if (d.args.length === 1 && d.args[0] === 'off') {
    ctx.pendingTransport.flush_interval = '-1'
    return {
      directives: [],
      notes: [info(`proxy_buffering off → transport http { flush_interval -1 } (streaming)`, d)],
    }
  }
  return { directives: [], notes: [] }
}

const addHeader: Translator = (d, ctx) => {
  if (d.args.length < 2) {
    return { directives: [], notes: [error(`add_header requires header name and value`, d)] }
  }
  const [name, value] = d.args
  const subbedValue = sub(value, d)
  return {
    directives: [{ name: 'header', args: [name, subbedValue.value] }],
    notes: [
      ...subbedValue.notes,
      warn(
        `add_header behavior differs: nginx applies on success only by default; Caddy 'header' applies always. Verify cache headers.`,
        d,
      ),
    ],
  }
}

const returnDirective: Translator = (d, ctx) => {
  if (d.args.length === 0) {
    return { directives: [], notes: [error(`return requires status code`, d)] }
  }
  const code = d.args[0]
  // return 301 https://...
  if (code === '301' || code === '302' || code === '307' || code === '308') {
    if (d.args.length < 2) {
      return { directives: [], notes: [error(`return ${code} requires URL`, d)] }
    }
    const url = sub(d.args[1], d)
    return {
      directives: [{ name: 'redir', args: [url.value, code] }],
      notes: url.notes,
    }
  }
  // return 200 'text'
  if (d.args.length >= 2) {
    const body = sub(d.args.slice(1).join(' '), d)
    return {
      directives: [{ name: 'respond', args: [code, JSON.stringify(body.value)] }],
      notes: body.notes,
    }
  }
  // return 404
  return { directives: [{ name: 'respond', args: [code] }], notes: [] }
}

const rewrite: Translator = (d, ctx) => {
  // rewrite REGEX REPLACEMENT [flag]
  if (d.args.length < 2) {
    return { directives: [], notes: [error(`rewrite requires pattern and replacement`, d)] }
  }
  const [pattern, replacement, flag] = d.args
  if (flag === 'permanent') {
    return {
      directives: [{ name: 'redir', args: [replacement, '301'] }],
      notes: [info(`rewrite ... permanent → redir 301`, d)],
    }
  }
  if (flag === 'redirect') {
    return {
      directives: [{ name: 'redir', args: [replacement, '302'] }],
      notes: [info(`rewrite ... redirect → redir 302`, d)],
    }
  }
  return {
    directives: [{ name: 'rewrite', args: [pattern, replacement] }],
    notes: [
      warn(
        `rewrite ${pattern} ${replacement} translated. Caddy 'rewrite' semantics differ from nginx — verify routing after.`,
        d,
      ),
    ],
  }
}

const tryFiles: Translator = (d, ctx) => {
  // try_files $uri $uri/ /index.html  =>  try_files {path} {path}/ /index.html
  const subs = d.args.map((a) => sub(a, d))
  const allNotes = subs.flatMap((s) => s.notes)
  return {
    directives: [{ name: 'try_files', args: subs.map((s) => s.value) }],
    notes: allNotes,
  }
}

const root: Translator = (d, ctx) => {
  if (d.args.length !== 1) return { directives: [], notes: [error(`root requires path`, d)] }
  return { directives: [{ name: 'root', args: ['*', d.args[0]] }], notes: [] }
}

const indexDirective: Translator = (d, ctx) => {
  return {
    directives: [{ name: 'file_server', args: [], block: [{ name: 'index', args: d.args }] }],
    notes: [],
  }
}

const clientMaxBodySize: Translator = (d, ctx) => {
  if (d.args.length !== 1) {
    return { directives: [], notes: [error(`client_max_body_size requires size`, d)] }
  }
  return {
    directives: [{ name: 'request_body', args: [], block: [{ name: 'max_size', args: [d.args[0]] }] }],
    notes: [],
  }
}

const gzipDirective: Translator = (d, ctx) => {
  if (d.args.length === 1 && d.args[0] === 'on') {
    return {
      directives: [{ name: 'encode', args: ['gzip'] }],
      notes: [info(`gzip on → encode gzip`, d)],
    }
  }
  return { directives: [], notes: [] }
}

const authBasic: Translator = (d, ctx) => {
  // Real auth_basic + auth_basic_user_file pair needs to be coordinated;
  // for Level 1 we emit a placeholder + warning
  return {
    directives: [],
    notes: [
      warn(
        `auth_basic translation requires a corresponding auth_basic_user_file. ` +
        `Combine with the htpasswd file path to produce 'basic_auth' in Caddy.`,
        d,
      ),
    ],
  }
}

const authBasicUserFile: Translator = (d, ctx) => {
  if (d.args.length !== 1) {
    return { directives: [], notes: [error(`auth_basic_user_file requires path`, d)] }
  }
  return {
    directives: [
      {
        name: 'basic_auth',
        args: [],
        leadingComment: `Translated from auth_basic_user_file ${d.args[0]} — load contents inline or use a Caddy module to reference the file.`,
      },
    ],
    notes: [
      info(`auth_basic_user_file ${d.args[0]} translated to 'basic_auth'. You'll need to inline credentials.`, d),
    ],
  }
}

const limitReq: Translator = (d, ctx) => {
  // limit_req zone=mylimit burst=10 nodelay
  let zone = ''
  let burst = ''
  for (const a of d.args) {
    if (a.startsWith('zone=')) zone = a.slice(5)
    else if (a.startsWith('burst=')) burst = a.slice(6)
  }
  return {
    directives: [
      {
        name: 'rate_limit',
        args: [],
        block: [
          { name: 'zone', args: [zone || 'default'] },
          burst ? { name: 'burst', args: [burst] } : { name: 'rate', args: ['10r/s'] },
        ],
        leadingComment: `Translated from limit_req zone=${zone}. Verify rate values match nginx limit_req_zone.`,
      },
    ],
    notes: [
      warn(
        `limit_req translates to Caddy rate_limit. The zone definition (limit_req_zone) must be configured separately in Caddy.`,
        d,
      ),
    ],
  }
}

const expires: Translator = (d, ctx) => {
  if (d.args.length !== 1) return { directives: [], notes: [] }
  const dur = d.args[0]
  // expires 1d -> Cache-Control: max-age=86400
  const seconds = parseDuration(dur)
  if (seconds === null) {
    return {
      directives: [{ name: 'header', args: ['Cache-Control', `"max-age=${dur}"`] }],
      notes: [warn(`expires duration ${dur} not parsed; emitted literally`, d)],
    }
  }
  return {
    directives: [{ name: 'header', args: ['Cache-Control', `"max-age=${seconds}"`] }],
    notes: [info(`expires ${dur} → Cache-Control max-age=${seconds}`, d)],
  }
}

const errorPage: Translator = (d, ctx) => {
  if (d.args.length < 2) {
    return { directives: [], notes: [error(`error_page requires status code(s) and target`, d)] }
  }
  return {
    directives: [],
    notes: [
      warn(
        `error_page translation requires the use of Caddy's 'handle_errors' block at the route level — emitted as a route-level concern, not inline.`,
        d,
      ),
    ],
  }
}

// SSL directives — Caddy auto-manages, mostly stripped with notes
const sslCertificate: Translator = (d, ctx) => ({
  directives: [],
  notes: [info(`ssl_certificate stripped — Caddy auto-manages certificates via Let's Encrypt or DNS-01.`, d)],
})

const sslCertificateKey: Translator = (d, ctx) => ({
  directives: [],
  notes: [info(`ssl_certificate_key stripped — Caddy auto-manages certificates.`, d)],
})

const sslProtocols: Translator = (d, ctx) => ({
  directives: [{ name: 'tls', args: [], block: [{ name: 'protocols', args: d.args }] }],
  notes: [],
})

const sslCiphers: Translator = (d, ctx) => ({
  directives: [{ name: 'tls', args: [], block: [{ name: 'ciphers', args: d.args }] }],
  notes: [warn(`ssl_ciphers translated. Caddy uses safer defaults; verify your cipher list is still appropriate.`, d)],
})

// Listen directives — usually stripped because Caddy listens on 80/443 by default
const listen: Translator = (d, ctx) => ({
  directives: [],
  notes: [info(`listen ${d.args.join(' ')} stripped — Caddy listens on 80/443 by default.`, d)],
})

const serverName: Translator = (d, ctx) => ({
  directives: [],
  notes: [info(`server_name ${d.args.join(' ')} extracted as route host (set in route configuration).`, d)],
})

// Logging
const accessLog: Translator = (d, ctx) => {
  if (d.args.length === 0 || d.args[0] === 'off') {
    return { directives: [], notes: [info(`access_log off — Caddy access logging disabled by default`, d)] }
  }
  const path = d.args[0]
  return {
    directives: [{ name: 'log', args: [], block: [{ name: 'output', args: ['file', path] }] }],
    notes: [info(`access_log ${path} → log { output file ${path} }`, d)],
  }
}

const errorLog: Translator = (d, ctx) => ({
  directives: [],
  notes: [info(`error_log stripped — Caddy logs errors automatically; configure level via Caddy global options`, d)],
})

// Connection / keepalive
const keepaliveTimeout: Translator = (d, ctx) => {
  if (d.args.length === 0) return { directives: [], notes: [] }
  ctx.pendingTransport.read_timeout = ctx.pendingTransport.read_timeout ?? d.args[0]
  return {
    directives: [],
    notes: [
      warn(
        `keepalive_timeout ${d.args[0]} approximated via transport http { read_timeout }. nginx and Caddy keepalive semantics differ; verify under load.`,
        d,
      ),
    ],
  }
}

const sendTimeout: Translator = (d, ctx) => {
  if (d.args.length === 1) ctx.pendingTransport.write_timeout = d.args[0]
  return { directives: [], notes: [] }
}

// gzip_types — Caddy's encode is type-agnostic by default; surface as note
const gzipTypes: Translator = (d, ctx) => ({
  directives: [],
  notes: [
    info(
      `gzip_types stripped — Caddy's 'encode gzip' compresses based on response size and a built-in safe list. Add 'encode { match { header Content-Type ... } }' manually if you need exact nginx behavior.`,
      d,
    ),
  ],
})

const gzipProxied: Translator = (d, ctx) => ({
  directives: [],
  notes: [info(`gzip_proxied stripped — Caddy 'encode' has built-in safe defaults for proxied content`, d)],
})

const gzipMinLength: Translator = (d, ctx) => ({
  directives: [],
  notes: [info(`gzip_min_length stripped — Caddy 'encode' has built-in minimum size threshold`, d)],
})

// Caching — no direct Caddy core equivalent
const proxyCache: Translator = (d, ctx) => ({
  directives: [],
  notes: [
    error(
      `proxy_cache has no Caddy core equivalent. Use the Caddy Souin module (https://github.com/darkweak/souin) or remove and rely on origin caching.`,
      d,
    ),
  ],
})

const proxyCachePath: Translator = (d, ctx) => ({
  directives: [],
  notes: [warn(`proxy_cache_path stripped — see proxy_cache note`, d)],
})

const proxyCacheValid: Translator = (d, ctx) => ({
  directives: [],
  notes: [warn(`proxy_cache_valid stripped — see proxy_cache note`, d)],
})

const proxyCacheBypass: Translator = (d, ctx) => ({
  directives: [],
  notes: [warn(`proxy_cache_bypass stripped — see proxy_cache note`, d)],
})

const proxyCacheKey: Translator = (d, ctx) => ({
  directives: [],
  notes: [warn(`proxy_cache_key stripped — see proxy_cache note`, d)],
})

// Error interception
const proxyInterceptErrors: Translator = (d, ctx) => ({
  directives: [],
  notes: [
    warn(
      `proxy_intercept_errors translated implicitly — use 'handle_errors' at the route level for custom error pages. Behavior may differ.`,
      d,
    ),
  ],
})

// `set` — limited; surface as warning since variable substitution at use site is hard
const setDirective: Translator = (d, ctx) => {
  if (d.args.length < 2) {
    return { directives: [], notes: [error(`set requires variable and value`, d)] }
  }
  return {
    directives: [],
    notes: [
      warn(
        `'set ${d.args[0]} ...' has no direct Caddy equivalent. Inline the value at the use site, or replace the variable usage with Caddy placeholders.`,
        d,
      ),
    ],
  }
}

// Geo / GeoIP
const geoDirective: Translator = (d, ctx) => ({
  directives: [],
  notes: [
    warn(
      `'geo' directive translation is partial. Replace with Caddy's @geo matcher: '@geo client_ip 192.168.0.0/16'. See https://caddyserver.com/docs/caddyfile/matchers#client_ip`,
      d,
    ),
  ],
})

const geoipCountry: Translator = (d, ctx) => ({
  directives: [],
  notes: [
    error(
      `geoip_country (nginx GeoIP v1 module) not translatable. Use the Caddy mholt/caddy-l4 or maxminddb module for geographic routing.`,
      d,
    ),
  ],
})

// Stream / mail blocks — out of HTTP scope
const streamBlock: Translator = (d, ctx) => ({
  directives: [],
  notes: [
    error(
      `'stream' (TCP/UDP) blocks are not supported by the HTTP-only converter. ProxyOS V2 supports TCP/UDP via the layer4 feature — configure separately.`,
      d,
    ),
  ],
})

const mailBlock: Translator = (d, ctx) => ({
  directives: [],
  notes: [
    error(
      `'mail' module not supported — Caddy is HTTP-only. For SMTP/IMAP/POP3 proxying, use a dedicated mail proxy.`,
      d,
    ),
  ],
})

// Subrequests have no Caddy equivalent
const subrequest: Translator = (d, ctx) => ({
  directives: [],
  notes: [
    error(
      `nginx subrequest patterns (auth_request, etc.) require Caddy's forward_auth handler — translate manually.`,
      d,
    ),
  ],
})

const authRequest: Translator = (d, ctx) => {
  if (d.args.length !== 1) return { directives: [], notes: [error(`auth_request requires path`, d)] }
  return {
    directives: [
      {
        name: 'forward_auth',
        args: ['localhost'],
        leadingComment: `Translated from auth_request ${d.args[0]} — replace 'localhost' with the upstream auth service host:port and configure copy_headers as needed.`,
        block: [{ name: 'uri', args: [d.args[0]] }],
      },
    ],
    notes: [
      warn(
        `auth_request ${d.args[0]} → forward_auth (Caddy). Specify the auth upstream and copy_headers manually.`,
        d,
      ),
    ],
  }
}

// Hard-fail directives
const ifBlock: Translator = (d, ctx) => {
  // Try to recognize the safe `if` patterns: method check, header regex
  // nginx: if ($request_method = POST) → Caddy: @post method POST
  // nginx: if ($http_user_agent ~ "bot") → Caddy: @bot header_regexp User-Agent bot
  const cond = d.args.join(' ')
  const methodMatch = cond.match(/^\(\s*\$request_method\s*=\s*([A-Z]+)\s*\)$/)
  if (methodMatch) {
    const method = methodMatch[1]
    const innerCtx = makeContext('location')
    innerCtx.currentLocationPath = ctx.currentLocationPath
    innerCtx.currentLocationMatch = ctx.currentLocationMatch
    const innerOut = (d.block ?? []).flatMap((c) => {
      const t = REGISTRY.get(c.name)
      return t ? t(c, innerCtx).directives : []
    })
    return {
      directives: [
        { name: `@${method.toLowerCase()}_method`, args: ['method', method] },
        { name: 'handle', args: [`@${method.toLowerCase()}_method`], block: innerOut },
      ],
      notes: [info(`if ($request_method = ${method}) → @method matcher`, d)],
    }
  }

  const userAgentMatch = cond.match(/^\(\s*\$http_user_agent\s*~\*?\s*"?([^")]+)"?\s*\)$/)
  if (userAgentMatch) {
    const pattern = userAgentMatch[1]
    return {
      directives: [
        { name: '@bot_ua', args: ['header_regexp', 'User-Agent', JSON.stringify(pattern)] },
      ],
      notes: [
        warn(
          `if ($http_user_agent ~ "${pattern}") → @bot_ua matcher. Wrap dependent directives in 'handle @bot_ua { ... }' manually.`,
          d,
        ),
      ],
    }
  }

  return {
    directives: [],
    notes: [
      error(
        `'if (${cond})' is not safely translatable. Only simple method and User-Agent checks are auto-converted; rewrite using Caddy matchers (https://caddyserver.com/docs/caddyfile/matchers).`,
        d,
      ),
    ],
  }
}

const luaBlock: Translator = (d, ctx) => ({
  directives: [],
  notes: [
    error(
      `Lua scripting (${d.name}) has no Caddy equivalent. Custom Caddy modules in Go are required for similar functionality.`,
      d,
    ),
  ],
})

const mapDirective: Translator = (d, ctx) => ({
  directives: [],
  notes: [
    error(
      `'map' directive cannot be translated standalone. Replace with explicit Caddy matchers or move logic into a Caddy module.`,
      d,
    ),
  ],
})

// ============================================================================
// Helpers
// ============================================================================

function parseDuration(s: string): number | null {
  const match = s.match(/^(\d+)([smhdwMy])?$/)
  if (!match) return null
  const value = parseInt(match[1], 10)
  const unit = match[2] ?? 's'
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
    M: 2592000,
    y: 31536000,
  }
  return value * (multipliers[unit] ?? 1)
}

function makeLocationHandleArg(
  path: string,
  match: 'prefix' | 'exact' | 'regex',
): { handlerName: string; matcher: string } {
  switch (match) {
    case 'prefix':
      // Prefix match in Caddy uses /path/* for "starts with /path/" semantics
      // (close enough to nginx prefix location)
      return { handlerName: 'handle', matcher: path.endsWith('/') ? path + '*' : path + '/*' }
    case 'exact':
      return { handlerName: 'handle', matcher: path }
    case 'regex':
      return { handlerName: 'handle_regexp', matcher: path }
  }
}

// ============================================================================
// Registry
// ============================================================================

export const REGISTRY: Map<string, Translator> = new Map([
  // Proxy
  ['proxy_pass', proxyPass],
  ['proxy_set_header', proxySetHeader],
  ['proxy_hide_header', proxyHideHeader],
  ['proxy_read_timeout', proxyReadTimeout],
  ['proxy_connect_timeout', proxyConnectTimeout],
  ['proxy_send_timeout', proxySendTimeout],
  ['proxy_http_version', proxyHttpVersion],
  ['proxy_buffering', proxyBuffering],

  // Headers
  ['add_header', addHeader],

  // Routing
  ['return', returnDirective],
  ['rewrite', rewrite],
  ['try_files', tryFiles],
  ['root', root],
  ['index', indexDirective],

  // Body
  ['client_max_body_size', clientMaxBodySize],

  // Compression
  ['gzip', gzipDirective],

  // Auth
  ['auth_basic', authBasic],
  ['auth_basic_user_file', authBasicUserFile],

  // Rate limiting
  ['limit_req', limitReq],

  // Caching
  ['expires', expires],

  // Logging
  ['access_log', accessLog],
  ['error_log', errorLog],

  // Connection
  ['keepalive_timeout', keepaliveTimeout],
  ['send_timeout', sendTimeout],

  // Compression extras
  ['gzip_types', gzipTypes],
  ['gzip_proxied', gzipProxied],
  ['gzip_min_length', gzipMinLength],

  // Caching (proxy_cache family)
  ['proxy_cache', proxyCache],
  ['proxy_cache_path', proxyCachePath],
  ['proxy_cache_valid', proxyCacheValid],
  ['proxy_cache_bypass', proxyCacheBypass],
  ['proxy_cache_key', proxyCacheKey],
  ['proxy_intercept_errors', proxyInterceptErrors],

  // Variables (limited)
  ['set', setDirective],

  // Geo
  ['geo', geoDirective],
  ['geoip_country', geoipCountry],

  // Auth subrequest
  ['auth_request', authRequest],

  // Out-of-scope blocks
  ['stream', streamBlock],
  ['mail', mailBlock],
  ['subrequest', subrequest],

  // Errors
  ['error_page', errorPage],

  // TLS — mostly stripped
  ['ssl_certificate', sslCertificate],
  ['ssl_certificate_key', sslCertificateKey],
  ['ssl_protocols', sslProtocols],
  ['ssl_ciphers', sslCiphers],

  // Server-level
  ['listen', listen],
  ['server_name', serverName],

  // Hard-fail
  ['if', ifBlock],
  ['access_by_lua_block', luaBlock],
  ['content_by_lua_block', luaBlock],
  ['header_filter_by_lua_block', luaBlock],
  ['body_filter_by_lua_block', luaBlock],
  ['rewrite_by_lua_block', luaBlock],
  ['map', mapDirective],
])

export function makeContext(parentKind = 'root'): TranslationContext {
  return {
    parentKind,
    pendingTransport: {},
    pendingHeadersUp: [],
    pendingHeadersDown: [],
  }
}
