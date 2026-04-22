import pino from 'pino'

export type Logger = pino.Logger

export function createLogger(subsystem: string): Logger {
  const isDev = process.env.NODE_ENV !== 'production'

  if (isDev) {
    return pino({
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          messageFormat: `${subsystem} {msg}`,
        },
      },
    })
  }

  return pino({
    level: 'info',
    base: { subsystem },
  })
}
