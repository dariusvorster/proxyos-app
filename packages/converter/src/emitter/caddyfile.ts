// Caddyfile emitter.
//
// Walks a CaddyDirective tree and emits Caddyfile syntax.
//
// Indentation: 2 spaces per nesting level.
// Blocks: directive args { ... } on multiple lines if non-empty.
// Comments: emitted as # before the directive.

import type { CaddyDirective } from '../types/caddy-ast.ts'

export function emit(directives: CaddyDirective[]): string {
  return directives.map((d) => emitDirective(d, 0)).join('\n')
}

function emitDirective(d: CaddyDirective, depth: number): string {
  const indent = '  '.repeat(depth)
  const lines: string[] = []

  if (d.leadingComment) {
    lines.push(`${indent}# ${d.leadingComment}`)
  }

  const head = `${indent}${d.name}${d.args.length > 0 ? ' ' + d.args.join(' ') : ''}`

  if (d.block === undefined) {
    lines.push(head)
  } else if (d.block.length === 0) {
    lines.push(`${head} { }`)
  } else {
    lines.push(`${head} {`)
    for (const child of d.block) {
      lines.push(emitDirective(child, depth + 1))
    }
    lines.push(`${indent}}`)
  }

  return lines.join('\n')
}
