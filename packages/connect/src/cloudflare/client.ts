const CF_BASE = 'https://api.cloudflare.com/client/v4'

interface CfApiResponse<T> {
  success: boolean
  errors: { code: number; message: string }[]
  result: T
}

export async function cfFetch<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${CF_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  })
  const json = (await res.json()) as CfApiResponse<T>
  if (!json.success) {
    throw new Error(json.errors.map(e => e.message).join(', ') || `CF API ${res.status}`)
  }
  return json.result
}
