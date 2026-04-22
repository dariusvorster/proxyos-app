import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import type { ProcessSpec, HealthState, ProcessState, HealthCheckConfig } from './types'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function waitForExit(child: ChildProcess): Promise<{ code: number | null; signal: string | null }> {
  return new Promise(resolve => {
    child.on('exit', (code, signal) => resolve({ code, signal: signal ?? null }))
  })
}

async function checkHttp(endpoint: string, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs) })
    return res.status < 500
  } catch {
    return false
  }
}

export class ManagedProcess {
  state: ProcessState = 'starting'
  pid?: number
  startedAt?: Date
  restartCount = 0
  lastExitCode: number | null = null
  health: HealthState = 'unknown'

  private logBuffer: string[] = []
  private child?: ChildProcess
  private healthTimer?: ReturnType<typeof setInterval>
  private consecutiveHealthFailures = 0
  private consecutiveHealthSuccesses = 0
  private _stopping = false

  constructor(
    readonly id: string,
    readonly spec: ProcessSpec,
  ) {}

  addLog(line: string): void {
    this.logBuffer.push(`${new Date().toISOString()} ${line}`)
    if (this.logBuffer.length > this.spec.logCircularBufferLines) {
      this.logBuffer.shift()
    }
  }

  logs(lines = 200): string[] {
    return this.logBuffer.slice(-lines)
  }

  signal(sig: NodeJS.Signals): void {
    this.child?.kill(sig)
  }

  isStopping(): boolean {
    return this._stopping
  }

  markStopping(): void {
    this._stopping = true
  }

  setChild(child: ChildProcess): void {
    this.child = child
  }

  stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = undefined
    }
  }

  startHealthCheck(cfg: HealthCheckConfig): void {
    this.healthTimer = setInterval(async () => {
      let ok = false
      try {
        if (cfg.type === 'http') {
          ok = await checkHttp(cfg.endpoint, cfg.timeoutMs)
        }
      } catch {
        ok = false
      }

      if (ok) {
        this.consecutiveHealthFailures = 0
        this.consecutiveHealthSuccesses++
        if (this.consecutiveHealthSuccesses >= cfg.healthyAfterChecks && this.health !== 'healthy') {
          this.health = 'healthy'
          this.spec.onHealth?.(true)
        }
      } else {
        this.consecutiveHealthSuccesses = 0
        this.consecutiveHealthFailures++
        if (this.consecutiveHealthFailures >= cfg.unhealthyAfterChecks && this.health !== 'unhealthy') {
          this.health = 'unhealthy'
          this.spec.onHealth?.(false)
        }
      }
    }, cfg.intervalMs)
  }
}

export class ProcessManager {
  private processes = new Map<string, ManagedProcess>()

  spawn(spec: ProcessSpec): ManagedProcess {
    if (this.processes.has(spec.id)) {
      throw new Error(`Process ${spec.id} already managed`)
    }
    const proc = new ManagedProcess(spec.id, spec)
    this.processes.set(spec.id, proc)
    void this.supervise(proc)
    return proc
  }

  get(id: string): ManagedProcess | undefined {
    return this.processes.get(id)
  }

  list(): ManagedProcess[] {
    return [...this.processes.values()]
  }

  async stop(id: string, gracePeriodMs = 5_000): Promise<void> {
    const proc = this.processes.get(id)
    if (!proc) return
    proc.markStopping()
    proc.state = 'stopping' as ProcessState
    proc.stopHealthCheck()
    proc.signal('SIGTERM')
    await Promise.race([
      sleep(gracePeriodMs),
      new Promise<void>(resolve => {
        const check = setInterval(() => {
          if (proc.state === 'stopped') { clearInterval(check); resolve() }
        }, 100)
      }),
    ])
    if (proc.state !== 'stopped') {
      proc.signal('SIGKILL')
    }
    this.processes.delete(id)
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.processes.keys()].map(id => this.stop(id)))
  }

  private async supervise(proc: ManagedProcess): Promise<void> {
    while (!proc.isStopping()) {
      const child = spawn(proc.spec.command, proc.spec.args, {
        env: { ...process.env, ...proc.spec.env },
        cwd: proc.spec.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      proc.setChild(child)
      proc.pid = child.pid
      proc.startedAt = new Date()
      proc.state = 'running'
      proc.health = 'unknown'
      proc.addLog(`[supervisor] started pid=${child.pid ?? '?'}`)

      child.stdout?.on('data', (data: Buffer) => {
        data.toString().split('\n').filter(Boolean).forEach(l => proc.addLog(l))
      })
      child.stderr?.on('data', (data: Buffer) => {
        data.toString().split('\n').filter(Boolean).forEach(l => proc.addLog(`[ERR] ${l}`))
      })

      if (proc.spec.healthCheck) {
        proc.startHealthCheck(proc.spec.healthCheck)
      }

      const { code, signal } = await waitForExit(child)
      proc.stopHealthCheck()
      proc.lastExitCode = code
      proc.addLog(`[supervisor] exited code=${code ?? signal}`)

      if (proc.isStopping()) {
        proc.state = 'stopped'
        return
      }

      proc.state = 'crashed'
      proc.spec.onExit?.(code, signal)

      if (proc.spec.restartPolicy === 'never') {
        proc.state = 'stopped'
        this.processes.delete(proc.id)
        return
      }
      if (proc.spec.restartPolicy === 'on-failure' && code === 0) {
        proc.state = 'stopped'
        this.processes.delete(proc.id)
        return
      }

      const uptimeMs = proc.startedAt ? Date.now() - proc.startedAt.getTime() : 0
      if (uptimeMs > proc.spec.backoff.resetAfterUptimeMs) {
        proc.restartCount = 0
      } else {
        proc.restartCount++
      }

      const delay = Math.min(
        proc.spec.backoff.initialDelayMs * Math.pow(proc.spec.backoff.multiplier, proc.restartCount),
        proc.spec.backoff.maxDelayMs,
      )
      proc.addLog(`[supervisor] restarting in ${Math.round(delay / 1000)}s (attempt ${proc.restartCount})`)
      await sleep(delay)
    }
    proc.state = 'stopped'
  }
}

export const processManager = new ProcessManager()
