#!/usr/bin/env tsx
// CLI: read an nginx config file, print converted Caddy + notes.

import { readFileSync } from 'node:fs'
import { convertNginxToCaddy } from './index.ts'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: tsx src/cli.ts <nginx-config-file>')
  process.exit(1)
}

const source = readFileSync(filePath, 'utf8')
const result = convertNginxToCaddy(source)

console.log('━━━ Generated Caddyfile ━━━')
console.log(result.caddyfile)
console.log()
console.log(`━━━ Notes (${result.notes.length}) ━━━`)
for (const note of result.notes) {
  const sev = note.severity.toUpperCase().padEnd(8)
  const where = note.position ? ` (line ${note.position.line})` : ''
  const which = note.directive ? ` [${note.directive}]` : ''
  console.log(`${sev}${which}${where}  ${note.message}`)
}
console.log()
console.log(`━━━ Result: ${result.success ? 'SUCCESS' : 'FAILED'} ━━━`)
process.exit(result.success ? 0 : 1)
