import * as tls from 'tls'

export type UpstreamProtocol = 'http' | 'https-trusted' | 'https-insecure'

export interface ProbeResult {
  suggestion: UpstreamProtocol | null
  error?: string
  details?: {
    certCn?: string
    certIssuer?: string
    certExpiresAt?: string
    statusCode?: number
  }
}

function tlsHandshake(
  host: string,
  port: number,
  rejectUnauthorized: boolean,
  timeoutMs: number,
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port, rejectUnauthorized, servername: host },
      () => resolve(socket),
    )
    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')) })
    socket.on('error', reject)
  })
}

/**
 * Probes an upstream to suggest the correct upstreamProtocol setting.
 * Steps: HTTPS strict → HTTPS skip-verify → HTTP. Total cap: 10s.
 * Runs server-side; the ProxyOS container must have network access to the upstream.
 */
export async function probeUpstream(host: string, port: number): Promise<ProbeResult> {
  // Step 1: HTTPS with trusted cert verification
  try {
    const sock = await tlsHandshake(host, port, true, 3000)
    const cert = sock.getPeerCertificate()
    sock.destroy()
    return {
      suggestion: 'https-trusted',
      details: {
        certCn: [cert.subject?.CN].flat()[0],
        certIssuer: [cert.issuer?.CN].flat()[0],
        certExpiresAt: cert.valid_to,
      },
    }
  } catch { /* fall through */ }

  // Step 2: HTTPS skip-verify (self-signed or untrusted)
  try {
    const sock = await tlsHandshake(host, port, false, 3000)
    const cert = sock.getPeerCertificate()
    sock.destroy()
    return {
      suggestion: 'https-insecure',
      details: {
        certCn: [cert.subject?.CN].flat()[0],
        certIssuer: [cert.issuer?.CN].flat()[0],
        certExpiresAt: cert.valid_to,
      },
    }
  } catch { /* fall through */ }

  // Step 3: Plain HTTP
  try {
    const res = await fetch(`http://${host}:${port}/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    })
    return { suggestion: 'http', details: { statusCode: res.status } }
  } catch { /* fall through */ }

  return { suggestion: null, error: 'Could not connect — check host and port.' }
}
