import pino from 'pino'

export type Logger = pino.Logger

export function createLogger(subsystem: string): Logger {
  const transport =
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            messageFormat: `${subsystem} {msg}`,
          },
        }
      : undefined

  return pino({
    level: 'info',
    base: { subsystem },
    transport,
  })
}
