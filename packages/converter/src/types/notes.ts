// Conversion notes — surfaced to the user after a conversion.

import type { Position } from './nginx-ast.ts'

export type NoteSeverity = 'info' | 'warning' | 'error'

export interface Note {
  severity: NoteSeverity
  message: string
  position?: Position
  directive?: string  // name of the nginx directive that produced this note
}

export interface ConversionResult {
  caddyfile: string
  notes: Note[]
  success: boolean  // false if any error notes
}
