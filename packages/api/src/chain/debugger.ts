import dns from 'node:dns/promises'

export interface DebugStep {
  name: string
  ok: boolean
  latencyMs: number
  detail: string
  error?: string
}

export interface DebugChainResult {
  domain: string
  steps: DebugStep[]
  overallOk: boolean
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const t = Date.now()
  const result = await fn()
  return { result, latencyMs: Date.now() - t }
}

export async function debugChain(
  domain: string,
  upstreamUrl: string,
  ssoForwardAuthUrl?: string | null,
): Promise<DebugChainResult> {
  const steps: DebugStep[] = []

  // Step 1: System DNS
  try {
    const { result: addrs, latencyMs } = await timed(() => dns.resolve4(domain))
    steps.push({ name: 'DNS (system resolver)', ok: addrs.length > 0, latencyMs, detail: `→ ${addrs.join(', ')}` })
  } catch (e) {
    steps.push({ name: 'DNS (system resolver)', ok: false, latencyMs: 0, detail: '', error: String(e) })
  }

  // Step 2: Cloudflare DNS
  try {
    const { result: res, latencyMs } = await timed(() =>
      fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(4000),
      }).then(r => r.json() as Promise<{ Answer?: { data: string }[] }>)
    )
    const addrs = res.Answer?.map(a => a.data) ?? []
    steps.push({ name: 'DNS (Cloudflare 1.1.1.1)', ok: addrs.length > 0, latencyMs, detail: addrs.length > 0 ? `→ ${addrs.join(', ')}` : 'NXDOMAIN' })
  } catch (e) {
    steps.push({ name: 'DNS (Cloudflare 1.1.1.1)', ok: false, latencyMs: 0, detail: '', error: String(e) })
  }

  // Step 3: HTTP GET to domain
  try {
    const { result: res, latencyMs } = await timed(() =>
      fetch(`https://${domain}`, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      })
    )
    steps.push({
      name: 'HTTP GET (domain)',
      ok: res.status < 500,
      latencyMs,
      detail: `HTTP ${res.status} · TLS ${res.url.startsWith('https') ? '✓' : '✗'}`,
    })
  } catch (e) {
    steps.push({ name: 'HTTP GET (domain)', ok: false, latencyMs: 0, detail: '', error: String(e) })
  }

  // Step 4: Upstream direct probe
  try {
    const { result: res, latencyMs } = await timed(() =>
      fetch(upstreamUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
    )
    steps.push({ name: 'Upstream (direct)', ok: res.status < 500, latencyMs, detail: `HTTP ${res.status}` })
  } catch (e) {
    steps.push({ name: 'Upstream (direct)', ok: false, latencyMs: 0, detail: '', error: String(e) })
  }

  // Step 5: SSO provider reachability (optional)
  if (ssoForwardAuthUrl) {
    try {
      const { result: res, latencyMs } = await timed(() =>
        fetch(ssoForwardAuthUrl, { method: 'GET', signal: AbortSignal.timeout(5000) })
      )
      steps.push({ name: 'SSO provider', ok: res.status < 500, latencyMs, detail: `HTTP ${res.status}` })
    } catch (e) {
      steps.push({ name: 'SSO provider', ok: false, latencyMs: 0, detail: '', error: String(e) })
    }
  }

  return {
    domain,
    steps,
    overallOk: steps.every(s => s.ok),
  }
}
