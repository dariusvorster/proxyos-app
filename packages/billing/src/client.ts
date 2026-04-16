const LS_BASE = 'https://api.lemonsqueezy.com'

function apiKey(): string {
  const key = process.env.LEMONSQUEEZY_API_KEY
  if (!key) throw new Error('LEMONSQUEEZY_API_KEY is not set')
  return key
}

export async function lsGet(path: string): Promise<unknown> {
  const res = await fetch(`${LS_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: 'application/vnd.api+json',
    },
  })
  if (!res.ok) throw new Error(`LS API GET ${path} → ${res.status}`)
  return res.json()
}

export async function lsPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${LS_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LS API POST ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

export async function lsLicencePost(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const res = await fetch(`${LS_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LS Licence API POST ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}
