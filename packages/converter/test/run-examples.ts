#!/usr/bin/env tsx
// Test runner: runs every example, checks expected outcomes, summarizes.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { convertNginxToCaddy } from '../src/index.ts'

interface TestExpectation {
  file: string
  shouldSucceed: boolean
  mustContain: string[]   // substrings that MUST appear in the caddyfile
  mustNotContain?: string[] // substrings that must NOT appear
  expectedErrors?: number   // expected number of error notes
}

const EXPECTATIONS: TestExpectation[] = [
  {
    file: '01-simple-proxy.conf',
    shouldSucceed: true,
    mustContain: [
      'handle /api/*',
      'reverse_proxy http://backend:3000',
      'header_up X-Real-IP {remote_host}',
      'header_up Host {host}',
      'transport http',
      'read_timeout 60s',
    ],
  },
  {
    file: '02-server-block.conf',
    shouldSucceed: true,
    mustContain: [
      'handle /*',
      'handle /api/v1/*',
      'handle /health',
      'respond 200 "ok"',
      'request_body',
      'max_size 100M',
      'tls',
      'protocols TLSv1.2 TLSv1.3',
    ],
    mustNotContain: [
      'ssl_certificate',  // should be stripped
      'listen',            // should be stripped
    ],
  },
  {
    file: '03-spa.conf',
    shouldSucceed: true,
    mustContain: [
      'try_files {path}',
      'encode gzip',
      'root * /var/www/app',
      'file_server',
      'index index.html',
      'Cache-Control "max-age=3600"',
      'reverse_proxy http://api-backend:8080',
    ],
  },
  {
    file: '04-redirect.conf',
    shouldSucceed: true,
    mustContain: ['redir https://new.example.com{uri} 301'],
  },
  {
    file: '05-unsupported.conf',
    shouldSucceed: false,
    mustContain: [],
    expectedErrors: 1, // Lua block. The if($http_user_agent~"bot") now produces a warning (auto-translated to matcher).
  },
  {
    file: '06-nextcloud.conf',
    shouldSucceed: true,
    mustContain: [
      'reverse_proxy http://nextcloud:80',
      'header_up Host {host}',
      'header_up X-Forwarded-For {>X-Forwarded-For}',
      'transport http',
      'read_timeout 86400s',
      'flush_interval -1',
      'log',
      'output file /var/log/nginx/cloud.access.log',
      'request_body',
      'max_size 10G',
      'encode gzip',
      'redir {scheme}://{host}/remote.php/dav 301',
      'respond 200',
    ],
    mustNotContain: ['gzip_types', 'gzip_min_length', 'error_log'],
  },
  {
    file: '07-auth-and-if.conf',
    shouldSucceed: true,
    mustContain: [
      'forward_auth',
      'uri /auth',
      '@post_method method POST',
      'handle @post_method',
      'reverse_proxy http://api-backend:3000',
    ],
  },
]

let passCount = 0
let failCount = 0
const failures: string[] = []

for (const exp of EXPECTATIONS) {
  const path = join('test', 'examples', exp.file)
  const source = readFileSync(path, 'utf8')
  const result = convertNginxToCaddy(source)

  const issues: string[] = []

  if (result.success !== exp.shouldSucceed) {
    issues.push(
      `expected ${exp.shouldSucceed ? 'success' : 'failure'}, got ${result.success ? 'success' : 'failure'}`,
    )
  }

  for (const must of exp.mustContain) {
    if (!result.caddyfile.includes(must)) {
      issues.push(`output missing required substring: ${JSON.stringify(must)}`)
    }
  }

  if (exp.mustNotContain) {
    for (const mustnot of exp.mustNotContain) {
      if (result.caddyfile.includes(mustnot)) {
        issues.push(`output contains forbidden substring: ${JSON.stringify(mustnot)}`)
      }
    }
  }

  if (exp.expectedErrors !== undefined) {
    const actualErrors = result.notes.filter((n) => n.severity === 'error').length
    if (actualErrors !== exp.expectedErrors) {
      issues.push(`expected ${exp.expectedErrors} error notes, got ${actualErrors}`)
    }
  }

  if (issues.length === 0) {
    passCount++
    console.log(`✓ ${exp.file}`)
  } else {
    failCount++
    failures.push(`✗ ${exp.file}\n  ${issues.join('\n  ')}`)
    console.log(`✗ ${exp.file}`)
    for (const i of issues) console.log(`    ${i}`)
  }
}

console.log()
console.log(`${passCount}/${passCount + failCount} tests passed`)

if (failCount > 0) {
  console.log()
  console.log('FAILURES:')
  for (const f of failures) console.log(f)
  process.exit(1)
}
