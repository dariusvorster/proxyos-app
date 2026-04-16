import { cfFetch } from './client'

export interface CfAccessApp {
  id: string
  name: string
  domain: string
  session_duration: string
  type: string
  aud: string
}

export async function cfListAccessApps(token: string, accountId: string): Promise<CfAccessApp[]> {
  return cfFetch<CfAccessApp[]>(token, `/accounts/${accountId}/access/apps`)
}

export async function cfFindAccessApp(token: string, accountId: string, domain: string): Promise<CfAccessApp | null> {
  const apps = await cfListAccessApps(token, accountId)
  return apps.find(a => a.domain === domain) ?? null
}

export async function cfCreateAccessApp(
  token: string, accountId: string,
  domain: string, name: string, sessionDuration = '24h',
): Promise<CfAccessApp> {
  return cfFetch<CfAccessApp>(token, `/accounts/${accountId}/access/apps`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      domain,
      type: 'self_hosted',
      session_duration: sessionDuration,
      allowed_idps: [],
      auto_redirect_to_identity: false,
    }),
  })
}

export async function cfEnsureAccessApp(
  token: string, accountId: string, domain: string, name: string,
): Promise<CfAccessApp> {
  const existing = await cfFindAccessApp(token, accountId, domain)
  if (existing) return existing
  return cfCreateAccessApp(token, accountId, domain, name)
}

export async function cfDeleteAccessApp(token: string, accountId: string, appId: string): Promise<void> {
  await cfFetch<{ id: string }>(token, `/accounts/${accountId}/access/apps/${appId}`, { method: 'DELETE' })
}
