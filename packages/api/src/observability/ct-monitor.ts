export interface CTMonitorConfig {
  checkIntervalHours: number
  alertOnNewIssuer: boolean
  knownIssuers: string[]
}

export interface CrtShEntry {
  issuer_name: string
  not_before: string
  serial_number: string
  name_value: string
}

export interface NewCTCert {
  issuer: string
  notBefore: string
  serialNumber: string
}

export const DEFAULT_CT_CONFIG: CTMonitorConfig = {
  checkIntervalHours: 6,
  alertOnNewIssuer: true,
  knownIssuers: ["Let's Encrypt", 'ZeroSSL', "Caddy's certificate authority"],
}

export function parseCTConfig(raw: string | null | undefined): CTMonitorConfig {
  if (!raw) return { ...DEFAULT_CT_CONFIG }
  try { return { ...DEFAULT_CT_CONFIG, ...JSON.parse(raw) } } catch { return { ...DEFAULT_CT_CONFIG } }
}

export async function pollCrtSh(domain: string, knownIssuers: string[] = []): Promise<NewCTCert[]> {
  const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`
  let entries: CrtShEntry[] = []
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return []
    entries = (await res.json()) as CrtShEntry[]
  } catch {
    return []
  }

  if (!Array.isArray(entries)) return []

  const seen = new Set<string>()
  const newCerts: NewCTCert[] = []

  for (const e of entries) {
    if (!e.serial_number || seen.has(e.serial_number)) continue
    seen.add(e.serial_number)

    const issuerName = e.issuer_name ?? ''
    const isKnown = knownIssuers.some(k => issuerName.toLowerCase().includes(k.toLowerCase()))
    if (!isKnown) {
      newCerts.push({
        issuer: issuerName,
        notBefore: e.not_before,
        serialNumber: e.serial_number,
      })
    }
  }

  return newCerts
}
