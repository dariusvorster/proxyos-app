// nginx AST — what the parser produces.
//
// nginx config is a tree of "directives". A directive has a name, zero or more
// arguments, and optionally a block of child directives.

export interface Position {
  line: number
  column: number
}

export interface NginxDirective {
  name: string
  args: string[]
  block?: NginxDirective[]
  position: Position
}

export interface NginxConfig {
  directives: NginxDirective[]
}

// Helpers for the translator
export function findChildren(parent: NginxDirective | NginxConfig, name: string): NginxDirective[] {
  const directives = 'directives' in parent ? parent.directives : (parent.block ?? [])
  return directives.filter((d) => d.name === name)
}

export function findChild(parent: NginxDirective | NginxConfig, name: string): NginxDirective | undefined {
  return findChildren(parent, name)[0]
}
