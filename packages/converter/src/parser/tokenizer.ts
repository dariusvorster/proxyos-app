// Nginx tokenizer.
//
// Turns nginx config text into a stream of tokens that the parser consumes.
//
// nginx grammar (informal):
//   directive  ::= name arg* (';' | '{' directive* '}')
//   name       ::= identifier
//   arg        ::= identifier | quoted-string | $variable | etc.
//   comment    ::= '#' ... \n
//
// Tricky bits:
// - quoted strings: "..." and '...' both legal; can contain $vars
// - escape sequences: \" inside "..."
// - line continuations: nginx doesn't have them, but multi-line strings do exist
// - $variables: $foo, $http_user_agent, ${complex}
// - special tokens: ; { } left as their own token kind

import type { Position } from '../types/nginx-ast.ts'

export type TokenKind =
  | 'word'           // identifier, $var, number, etc.
  | 'string'         // quoted "..." or '...'
  | 'semi'           // ;
  | 'open-brace'     // {
  | 'close-brace'    // }
  | 'comment'        // # ... (we keep these mostly for line tracking)
  | 'eof'

export interface Token {
  kind: TokenKind
  value: string      // for 'string', the unescaped contents; for 'word', the literal
  raw: string        // original text (for strings, includes the quotes)
  position: Position
}

export class TokenizerError extends Error {
  constructor(message: string, public readonly position: Position) {
    super(`${message} at line ${position.line}:${position.column}`)
  }
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let col = 1

  const pos = (): Position => ({ line, column: col })

  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (source[i] === '\n') {
        line++
        col = 1
      } else {
        col++
      }
      i++
    }
  }

  const peek = (offset = 0) => source[i + offset]

  const isWhitespace = (c: string | undefined) =>
    c === ' ' || c === '\t' || c === '\n' || c === '\r'

  const isWordChar = (c: string | undefined) =>
    c !== undefined &&
    !isWhitespace(c) &&
    c !== ';' &&
    c !== '{' &&
    c !== '}' &&
    c !== '"' &&
    c !== "'" &&
    c !== '#'

  while (i < source.length) {
    const c = peek()

    // whitespace
    if (isWhitespace(c)) {
      advance()
      continue
    }

    // comment — consume to end of line
    if (c === '#') {
      const start = pos()
      let raw = ''
      while (i < source.length && peek() !== '\n') {
        raw += peek()
        advance()
      }
      tokens.push({ kind: 'comment', value: raw.slice(1).trim(), raw, position: start })
      continue
    }

    // single-character tokens
    if (c === ';') {
      tokens.push({ kind: 'semi', value: ';', raw: ';', position: pos() })
      advance()
      continue
    }
    if (c === '{') {
      tokens.push({ kind: 'open-brace', value: '{', raw: '{', position: pos() })
      advance()
      continue
    }
    if (c === '}') {
      tokens.push({ kind: 'close-brace', value: '}', raw: '}', position: pos() })
      advance()
      continue
    }

    // quoted string
    if (c === '"' || c === "'") {
      const quote = c
      const start = pos()
      let raw = quote
      let value = ''
      advance() // consume opening quote
      while (i < source.length && peek() !== quote) {
        if (peek() === '\\' && peek(1) === quote) {
          raw += '\\' + quote
          value += quote
          advance(2)
        } else if (peek() === '\\' && peek(1) === '\\') {
          raw += '\\\\'
          value += '\\'
          advance(2)
        } else {
          raw += peek()
          value += peek()
          advance()
        }
      }
      if (i >= source.length) {
        throw new TokenizerError(`Unterminated string starting`, start)
      }
      raw += quote
      advance() // consume closing quote
      tokens.push({ kind: 'string', value, raw, position: start })
      continue
    }

    // word — identifier, variable, number, regex, etc.
    if (isWordChar(c)) {
      const start = pos()
      let value = ''
      while (i < source.length && isWordChar(peek())) {
        value += peek()
        advance()
      }
      tokens.push({ kind: 'word', value, raw: value, position: start })
      continue
    }

    // shouldn't reach here
    throw new TokenizerError(`Unexpected character ${JSON.stringify(c)}`, pos())
  }

  tokens.push({ kind: 'eof', value: '', raw: '', position: pos() })
  return tokens
}
