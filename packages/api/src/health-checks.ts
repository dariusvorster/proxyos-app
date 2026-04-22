// Re-export health check helpers so the REST route at
// apps/web/src/app/api/health/detailed/route.ts can call them
// without going through tRPC.
export { checkDatabase, checkCaddy, checkDocker, checkAuth, checkDisk, settled } from './routers/system'
