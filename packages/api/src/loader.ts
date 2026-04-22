import { getDb, connections } from '@proxyos/db'
import { createLogger } from '@proxyos/logger'

const logger = createLogger('[api]')
import {
  adapterRegistry, decryptCredentials,
  AuthentikAdapter, AutheliaAdapter, KeycloakAdapter, ZitadelAdapter,
  UptimeKumaAdapter, BetterstackAdapter, FreshpingAdapter,
  ZulipAdapter, SlackAdapter, WebhookAdapter,
} from '@proxyos/connect'
import type {
  AuthentikCreds, AutheliaCreds, KeycloakCreds, ZitadelCreds,
  UptimeKumaCreds, BetterstackCreds, FreshpingCreds,
  ZulipCreds, SlackCreds, WebhookCreds,
} from '@proxyos/connect'
import { CloudflareAdapter } from '@proxyos/connect/cloudflare'
import type { CloudflareCreds } from '@proxyos/connect/cloudflare'

export async function loadAdapters(): Promise<void> {
  const db = getDb()
  const rows = await db.select().from(connections).all()

  for (const row of rows) {
    try {
      const creds = JSON.parse(decryptCredentials(row.credentials)) as Record<string, unknown>
      const adapter = buildAdapter(row.type, row.id, creds)
      if (adapter) {
        adapterRegistry.register(adapter)
        if ('subscribeToEventBus' in adapter) {
          (adapter as ZulipAdapter | SlackAdapter | WebhookAdapter).subscribeToEventBus()
        }
      }
    } catch {
      // Skip — PROXYOS_SECRET may not be set in dev, or credentials corrupt
    }
  }
  logger.info({ count: adapterRegistry.all().length }, 'adapters loaded')
}

function buildAdapter(type: string, connectionId: string, creds: Record<string, unknown>) {
  switch (type) {
    case 'cloudflare':   return new CloudflareAdapter(connectionId, creds as unknown as CloudflareCreds)
    case 'authentik':    return new AuthentikAdapter(connectionId, creds as unknown as AuthentikCreds)
    case 'authelia':     return new AutheliaAdapter(connectionId, creds as unknown as AutheliaCreds)
    case 'keycloak':     return new KeycloakAdapter(connectionId, creds as unknown as KeycloakCreds)
    case 'zitadel':      return new ZitadelAdapter(connectionId, creds as unknown as ZitadelCreds)
    case 'uptime_kuma':  return new UptimeKumaAdapter(connectionId, creds as unknown as UptimeKumaCreds)
    case 'betterstack':  return new BetterstackAdapter(connectionId, creds as unknown as BetterstackCreds)
    case 'freshping':    return new FreshpingAdapter(connectionId, creds as unknown as FreshpingCreds)
    case 'zulip':        return new ZulipAdapter(connectionId, creds as unknown as ZulipCreds)
    case 'slack':        return new SlackAdapter(connectionId, creds as unknown as SlackCreds)
    case 'webhook':      return new WebhookAdapter(connectionId, creds as unknown as WebhookCreds)
    default:             return null
  }
}
