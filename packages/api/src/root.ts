import { router, publicProcedure } from './trpc'
import { alertsRouter } from './routers/alerts'
import { analyticsRouter } from './routers/analytics'
import { auditRouter } from './routers/audit'
import { caddyRouter } from './routers/caddy'
import { certificatesRouter } from './routers/certificates'
import { dashboardRouter } from './routers/dashboard'
import { dnsRouter } from './routers/dns'
import { routesRouter } from './routers/routes'
import { ssoRouter } from './routers/sso'
import { systemRouter } from './routers/system'
import { agentsRouter } from './routers/agents'
import { importersRouter } from './routers/importers'
import { scannerRouter } from './routers/scanner'
import { connectionsRouter } from './routers/connections'
import { chainRouter } from './routers/chain'
import { monitorsRouter } from './routers/monitors'
import { notificationsRouter } from './routers/notifications'
import { securityRouter } from './routers/security'
import { intelligenceRouter } from './routers/intelligence'
import { observabilityRouter } from './routers/observability'
import { apiKeysRouter } from './routers/apiKeys'
import { templatesRouter } from './routers/templates'
import { automationRouter } from './routers/automation'
import { usersRouter } from './routers/users'
import { approvalsRouter } from './routers/approvals'
import { integrationsRouter } from './routers/integrations'
import { systemLogRouter } from './routers/systemLog'
import { billingRouter } from './routers/billing'
import { redirectHostsRouter } from './routers/redirectHosts'
import { errorHostsRouter } from './routers/errorHosts'
import { operationLogsRouter } from './routers/operationLogs'
import { preflightRouter } from './routers/preflight'
import { accessListsRouter } from './routers/accessLists'
import { streamsRouter } from './routers/streams'

const PKG_VERSION = '0.2.0'

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, version: PKG_VERSION })),
  alerts: alertsRouter,
  analytics: analyticsRouter,
  audit: auditRouter,
  caddy: caddyRouter,
  certificates: certificatesRouter,
  dashboard: dashboardRouter,
  dns: dnsRouter,
  routes: routesRouter,
  sso: ssoRouter,
  system: systemRouter,
  agents: agentsRouter,
  importers: importersRouter,
  scanner: scannerRouter,
  connections: connectionsRouter,
  chain: chainRouter,
  monitors: monitorsRouter,
  notifications: notificationsRouter,
  security: securityRouter,
  intelligence: intelligenceRouter,
  observability: observabilityRouter,
  apiKeys: apiKeysRouter,
  templates: templatesRouter,
  automation: automationRouter,
  users: usersRouter,
  approvals: approvalsRouter,
  integrations: integrationsRouter,
  systemLog: systemLogRouter,
  billing: billingRouter,
  redirectHosts: redirectHostsRouter,
  errorHosts: errorHostsRouter,
  operationLogs: operationLogsRouter,
  preflight: preflightRouter,
  accessLists: accessListsRouter,
  streams: streamsRouter,
})

export type AppRouter = typeof appRouter
