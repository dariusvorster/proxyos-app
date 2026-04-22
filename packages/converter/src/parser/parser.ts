// Nginx parser.
//
// Recursive-descent parser. Consumes tokens, produces NginxConfig AST.
//
// Grammar (informal):
//   config     ::= directive*
//   directive  ::= word arg* (';' | '{' directive* '}')
//   arg        ::= word | string

import type { NginxConfig, NginxDirective, Position } from '../types/nginx-ast.ts'
import type { Token } from './tokenizer.ts'
import { tokenize } from './tokenizer.ts'

export class ParserError extends Error {
  constructor(message: string, public readonly position: Position) {
    super(`${message} at line ${position.line}:${position.column}`)
  }
}

// Directives whose block bodies contain non-nginx syntax (Lua, JS, etc.).
// We don't attempt to parse the body — we replace it with an empty block
// before tokenizing, so the translator still sees the directive name and
// can produce the appropriate "unsupported" error.
const OPAQUE_BLOCK_DIRECTIVES = [
  'access_by_lua_block',
  'content_by_lua_block',
  'header_filter_by_lua_block',
  'body_filter_by_lua_block',
  'rewrite_by_lua_block',
  'init_by_lua_block',
  'init_worker_by_lua_block',
  'log_by_lua_block',
  'ssl_certificate_by_lua_block',
  'ssl_session_fetch_by_lua_block',
  'ssl_session_store_by_lua_block',
  'js_content',
  'js_periodic',
]

/**
 * Replace `<directive_name> { ...arbitrary content... }` with
 * `<directive_name>;` so the parser sees the directive but skips the body.
 *
 * Brace-balanced — handles nested braces within the Lua body.
 */
function stripOpaqueBlocks(source: string): string {
  let result = source
  for (const name of OPAQUE_BLOCK_DIRECTIVES) {
    // Find the directive name followed by optional whitespace and an opening brace
    const re = new RegExp(`\\b${name}\\b\\s*\\{`, 'g')
    let match: RegExpExecArray | null
    const replacements: Array<{ start: number; end: number; replacement: string }> = []

    while ((match = re.exec(result)) !== null) {
      const openBraceIdx = match.index + match[0].length - 1
      let depth = 1
      let i = openBraceIdx + 1
      while (i < result.length && depth > 0) {
        const c = result[i]
        if (c === '{') depth++
        else if (c === '}') depth--
        i++
      }
      if (depth === 0) {
        replacements.push({ start: match.index, end: i, replacement: `${name};` })
      }
    }

    // Apply replacements in reverse so indices stay valid
    for (let r = replacements.length - 1; r >= 0; r--) {
      const { start, end, replacement } = replacements[r]
      result = result.slice(0, start) + replacement + result.slice(end)
    }
  }
  return result
}

class TokenStream {
  private idx = 0
  constructor(private tokens: Token[]) {}

  peek(offset = 0): Token {
    return this.tokens[this.idx + offset]
  }

  consume(): Token {
    return this.tokens[this.idx++]
  }

  // Skip comments — we keep them in token stream for line tracking but don't
  // emit them as part of the parsed AST (V2.1 may want to preserve them)
  skipComments() {
    while (this.peek().kind === 'comment') {
      this.idx++
    }
  }

  isEof(): boolean {
    this.skipComments()
    return this.peek().kind === 'eof'
  }
}

export function parse(source: string): NginxConfig {
  const stripped = stripOpaqueBlocks(source)
  const tokens = tokenize(stripped)
  const stream = new TokenStream(tokens)
  const directives: NginxDirective[] = []

  while (!stream.isEof()) {
    directives.push(parseDirective(stream))
  }

  return { directives }
}

function parseDirective(stream: TokenStream): NginxDirective {
  stream.skipComments()
  const nameToken = stream.consume()

  if (nameToken.kind !== 'word') {
    throw new ParserError(
      `Expected directive name, got ${nameToken.kind} (${JSON.stringify(nameToken.value)})`,
      nameToken.position,
    )
  }

  const name = nameToken.value
  const position = nameToken.position
  const args: string[] = []

  // Consume args until we hit ; or { (or eof which is an error)
  while (true) {
    stream.skipComments()
    const t = stream.peek()

    if (t.kind === 'semi') {
      stream.consume()
      return { name, args, position }
    }

    if (t.kind === 'open-brace') {
      stream.consume()
      const block: NginxDirective[] = []
      while (true) {
        stream.skipComments()
        const next = stream.peek()
        if (next.kind === 'close-brace') {
          stream.consume()
          return { name, args, block, position }
        }
        if (next.kind === 'eof') {
          throw new ParserError(`Unclosed block for directive '${name}'`, position)
        }
        block.push(parseDirective(stream))
      }
    }

    if (t.kind === 'eof') {
      throw new ParserError(`Unexpected end of file in directive '${name}'`, position)
    }

    if (t.kind === 'close-brace') {
      throw new ParserError(`Unexpected '}' in directive '${name}'`, t.position)
    }

    if (t.kind === 'word' || t.kind === 'string') {
      args.push(t.value)
      stream.consume()
      continue
    }

    throw new ParserError(`Unexpected token in directive '${name}': ${t.kind}`, t.position)
  }
}
