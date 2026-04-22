import pino from 'pino'
import { Writable } from 'stream'

export type Logger = pino.Logger

// ─── In-memory ring buffer ────────────────────────────────────────────────────

export type LogEntry = {
  time: number
  level: number
  subsystem: string
  msg: string
  [key: string]: unknown
}

const RING_SIZE = 1000
const ringBuffer: LogEntry[] = []

function pushEntry(entry: LogEntry): void {
  if (ringBuffer.length >= RING_SIZE) {
    ringBuffer.shift()
  }
  ringBuffer.push(entry)
}

export function getRecentLogs(): LogEntry[] {
  return ringBuffer.slice()
}

export function clearLogs(): void {
  ringBuffer.length = 0
}

// ─── Ring-buffer writable stream ─────────────────────────────────────────────

function makeRingStream(subsystem: string): Writable {
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      try {
        const line = chunk.toString().trimEnd()
        if (line) {
          const parsed = JSON.parse(line) as LogEntry
          pushEntry({ subsystem, ...parsed })
        }
      } catch {
        // non-JSON chunk (pino-pretty output) — ignore
      }
      callback()
    },
  })
}

// ─── Logger factory ───────────────────────────────────────────────────────────

export function createLogger(subsystem: string): Logger {
  const ringStream = makeRingStream(subsystem)

  if (process.env.NODE_ENV !== 'production') {
    // In dev, pino-pretty handles formatting. We create a JSON logger that
    // feeds the ring buffer, plus a separate pretty logger for stdout.
    // Use pino.multistream to write to both targets from a single logger.
    const streams = pino.multistream([
      {
        stream: pino.transport({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            messageFormat: `${subsystem} {msg}`,
          },
        }),
      },
      { stream: ringStream },
    ])

    return pino({ level: 'info', base: { subsystem } }, streams)
  }

  // In production write JSON to stdout and to ring buffer.
  const streams = pino.multistream([{ stream: process.stdout }, { stream: ringStream }])

  return pino({ level: 'info', base: { subsystem } }, streams)
}
