// Main entry point for the converter.

import { parse } from './parser/parser.ts'
import { emit } from './emitter/caddyfile.ts'
import { walk } from './translator/walker.ts'
import type { ConversionResult } from './types/notes.ts'
import { ParserError } from './parser/parser.ts'
import { TokenizerError } from './parser/tokenizer.ts'

export function convertNginxToCaddy(nginxSource: string): ConversionResult {
  // Parse — catch tokenizer/parser errors as conversion errors
  let ast
  try {
    ast = parse(nginxSource)
  } catch (e) {
    if (e instanceof TokenizerError || e instanceof ParserError) {
      return {
        caddyfile: '',
        notes: [
          {
            severity: 'error',
            message: `Parse error: ${e.message}`,
            position: e.position,
          },
        ],
        success: false,
      }
    }
    throw e
  }

  // Translate
  const { directives, notes } = walk(ast)

  // Emit
  const caddyfile = emit(directives)

  return {
    caddyfile,
    notes,
    success: notes.every((n) => n.severity !== 'error'),
  }
}

export { parse } from './parser/parser.ts'
export { walk } from './translator/walker.ts'
export { emit } from './emitter/caddyfile.ts'
export type { ConversionResult, Note } from './types/notes.ts'
