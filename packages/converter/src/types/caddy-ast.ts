// Caddy AST — what the translator produces.
//
// We use a simple Caddyfile-like tree because the route's custom config field
// in ProxyOS accepts Caddyfile syntax (not JSON). The emitter walks this tree
// and produces Caddyfile text.
//
// A CaddyDirective is name + args + optional block of children. Same shape as
// nginx but the semantics (and emission rules) differ.

export interface CaddyDirective {
  name: string
  args: string[]
  block?: CaddyDirective[]
  // A leading comment to emit above this directive (used for warnings inline)
  leadingComment?: string
}

export interface CaddyOutput {
  directives: CaddyDirective[]
}
