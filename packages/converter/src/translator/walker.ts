// AST walker.
//
// Recursively walks the nginx AST, applying translators from the registry,
// handling nested scopes (server, location, http blocks).
//
// Special handling:
// - server { ... } blocks: walk children with parentKind='server'
// - location PATH { ... } blocks: walk children with currentLocationPath set
// - http { ... } blocks: walk children with parentKind='http' (mostly transparent)
// - upstream NAME { ... } blocks: collect for later use (Level 2 mostly)

import type { CaddyDirective } from '../types/caddy-ast.ts'
import type { NginxConfig, NginxDirective } from '../types/nginx-ast.ts'
import type { Note } from '../types/notes.ts'
import { REGISTRY, makeContext, type TranslationContext, type TranslationOutput } from './translators.ts'

export function walk(config: NginxConfig): TranslationOutput {
  const ctx = makeContext('root')
  return walkDirectives(config.directives, ctx)
}

// Directives whose translators only stash state (pendingHeadersUp,
// pendingTransport) without emitting Caddy directives. These must be processed
// BEFORE emitter directives (proxy_pass, return) so the emitters can pick up
// the accumulated state regardless of source order.
const MODIFIER_DIRECTIVES = new Set([
  'proxy_set_header',
  'proxy_hide_header',
  'proxy_read_timeout',
  'proxy_connect_timeout',
  'proxy_send_timeout',
  'proxy_http_version',
  'proxy_buffering',
])

function walkDirectives(directives: NginxDirective[], ctx: TranslationContext): TranslationOutput {
  const allDirectives: CaddyDirective[] = []
  const allNotes: Note[] = []

  // Two-pass: modifiers first (stash state), then emitters (consume state)
  const modifiers = directives.filter((d) => MODIFIER_DIRECTIVES.has(d.name))
  const emitters = directives.filter((d) => !MODIFIER_DIRECTIVES.has(d.name))

  for (const d of modifiers) {
    const out = walkDirective(d, ctx)
    allDirectives.push(...out.directives)
    allNotes.push(...out.notes)
  }
  for (const d of emitters) {
    const out = walkDirective(d, ctx)
    allDirectives.push(...out.directives)
    allNotes.push(...out.notes)
  }

  // After both passes, any pending headers/transport not consumed by a
  // proxy_pass become orphans (e.g. location block with proxy_set_header but
  // no proxy_pass). Surface as warning.
  if (ctx.pendingHeadersUp.length > 0 || ctx.pendingHeadersDown.length > 0) {
    allNotes.push({
      severity: 'warning',
      message: `Headers (${[...ctx.pendingHeadersUp.map((h) => h.name), ...ctx.pendingHeadersDown.map((h) => h.name)].join(', ')}) were declared but no proxy_pass followed in the same scope. They have no effect.`,
    })
    ctx.pendingHeadersUp = []
    ctx.pendingHeadersDown = []
  }

  return { directives: allDirectives, notes: allNotes }
}

function walkDirective(d: NginxDirective, ctx: TranslationContext): TranslationOutput {
  // Block directives need special handling
  if (d.name === 'http') {
    return walkHttpBlock(d, ctx)
  }
  if (d.name === 'server') {
    return walkServerBlock(d, ctx)
  }
  if (d.name === 'location') {
    return walkLocationBlock(d, ctx)
  }
  if (d.name === 'upstream') {
    return walkUpstreamBlock(d, ctx)
  }

  // Look up in registry
  const translator = REGISTRY.get(d.name)
  if (translator) {
    return translator(d, ctx)
  }

  // Unknown directive — surface as warning, skip
  return {
    directives: [],
    notes: [
      {
        severity: 'warning',
        message: `Unknown nginx directive '${d.name}' — skipped. If this directive is important, use a custom Caddy directive instead.`,
        position: d.position,
        directive: d.name,
      },
    ],
  }
}

function walkHttpBlock(d: NginxDirective, ctx: TranslationContext): TranslationOutput {
  // http blocks are mostly transparent — walk children as if at top level
  const newCtx: TranslationContext = { ...ctx, parentKind: 'http' }
  return walkDirectives(d.block ?? [], newCtx)
}

function walkServerBlock(d: NginxDirective, ctx: TranslationContext): TranslationOutput {
  // server blocks emit the listen/server_name as info notes (handled by their
  // translators), and walk the rest with parentKind='server'.
  const newCtx: TranslationContext = { ...ctx, parentKind: 'server' }
  return walkDirectives(d.block ?? [], newCtx)
}

function walkLocationBlock(d: NginxDirective, ctx: TranslationContext): TranslationOutput {
  // Parse location args:
  //   location /path                     → prefix
  //   location = /path                   → exact
  //   location ~ /regex/                 → case-sensitive regex
  //   location ~* /regex/i               → case-insensitive regex
  if (d.args.length === 0) {
    return {
      directives: [],
      notes: [
        {
          severity: 'error',
          message: `location block requires path argument`,
          position: d.position,
          directive: 'location',
        },
      ],
    }
  }

  let path: string
  let match: 'prefix' | 'exact' | 'regex'
  if (d.args[0] === '=' && d.args.length >= 2) {
    path = d.args[1]
    match = 'exact'
  } else if ((d.args[0] === '~' || d.args[0] === '~*') && d.args.length >= 2) {
    path = d.args[1]
    match = 'regex'
  } else {
    path = d.args[0]
    match = 'prefix'
  }

  // Each location gets its own translation context — pending headers in outer
  // scope don't leak into location, and vice versa
  const newCtx: TranslationContext = {
    parentKind: 'location',
    currentLocationPath: path,
    currentLocationMatch: match,
    pendingHeadersUp: [],
    pendingHeadersDown: [],
    pendingTransport: {},
  }
  const inner = walkDirectives(d.block ?? [], newCtx)

  // If the inner walk produced anything that wasn't already wrapped in a handle,
  // wrap it now. This catches cases like `location /api { add_header X Y; }` —
  // there's no proxy_pass to absorb it, so we need to emit the handle ourselves.
  //
  // The translators that wrap themselves (proxy_pass) already produced handle
  // blocks. Bare directives (add_header, return, respond) need wrapping.
  const wrapped = wrapStandaloneInHandle(inner.directives, path, match)
  return { directives: wrapped, notes: inner.notes }
}

function walkUpstreamBlock(d: NginxDirective, ctx: TranslationContext): TranslationOutput {
  // upstream blocks define named upstream pools. Level 1 doesn't fully support
  // these — we emit a warning and the upstream definition as a comment.
  const upstreamName = d.args[0] ?? 'unnamed'
  const servers = (d.block ?? [])
    .filter((c) => c.name === 'server')
    .map((c) => c.args[0])

  return {
    directives: [
      {
        name: 'reverse_proxy',
        args: servers,
        leadingComment: `Translated from upstream '${upstreamName}' — load balancing strategy from nginx not preserved. Verify lb_policy.`,
      },
    ],
    notes: [
      {
        severity: 'warning',
        message: `upstream block '${upstreamName}' translated to inline reverse_proxy with multiple backends. nginx-Plus features (active health checks, sticky sessions) not translated.`,
        position: d.position,
        directive: 'upstream',
      },
    ],
  }
}

function wrapStandaloneInHandle(
  directives: CaddyDirective[],
  path: string,
  match: 'prefix' | 'exact' | 'regex',
): CaddyDirective[] {
  // If the directives contain a top-level handle/handle_regexp, leave them
  // alone — they were already wrapped by proxy_pass.
  if (directives.some((d) => d.name === 'handle' || d.name === 'handle_regexp')) {
    return directives
  }

  if (directives.length === 0) return []

  // Wrap everything in a handle block scoped to this location
  const matcher =
    match === 'exact'
      ? path
      : match === 'regex'
        ? path
        : path.endsWith('/')
          ? path + '*'
          : path + '/*'
  const handlerName = match === 'regex' ? 'handle_regexp' : 'handle'
  return [{ name: handlerName, args: [matcher], block: directives }]
}
