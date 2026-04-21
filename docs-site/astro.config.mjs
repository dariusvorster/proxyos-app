import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://docs.proxyos.app',
  integrations: [
    starlight({
      title: 'ProxyOS',
      description: 'Documentation for ProxyOS — the homelab reverse proxy',
      logo: {
        alt: 'ProxyOS',
      },
      social: {
        github: 'https://github.com/dariusvorster/proxyos-app',
      },
      editLink: {
        baseUrl: 'https://github.com/dariusvorster/proxyos-app/edit/main/',
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Overview', slug: 'docs/index' },
            { label: 'Installation', slug: 'docs/getting-started/installation' },
            { label: 'First Route', slug: 'docs/getting-started/first-route' },
            { label: 'Concepts', slug: 'docs/getting-started/concepts' },
            { label: 'Docker Compose Reference', slug: 'docs/getting-started/docker-compose-reference' },
          ],
        },
        {
          label: 'Routes',
          items: [
            { label: 'Creating Routes', slug: 'docs/features/routes/creating-routes' },
            { label: 'Upstream Configuration', slug: 'docs/features/routes/upstream-configuration' },
            { label: 'TLS Modes', slug: 'docs/features/routes/tls-modes' },
            { label: 'Health Checks', slug: 'docs/features/routes/health-checks' },
            { label: 'Headers', slug: 'docs/features/routes/headers' },
            { label: 'Load Balancing', slug: 'docs/features/routes/load-balancing' },
            { label: 'Rate Limiting', slug: 'docs/features/routes/rate-limiting' },
            { label: 'WAF', slug: 'docs/features/routes/waf' },
            { label: 'WebSockets', slug: 'docs/features/routes/websockets' },
          ],
        },
        {
          label: 'Features',
          items: [
            { label: 'Redirect Hosts', slug: 'docs/features/redirect-hosts' },
            { label: 'Error Hosts', slug: 'docs/features/error-hosts' },
            { label: 'Streams (TCP/UDP)', slug: 'docs/features/streams' },
            { label: 'SSO / Forward Auth', slug: 'docs/features/sso' },
            { label: 'Federation', slug: 'docs/features/federation' },
            { label: 'Certificates', slug: 'docs/features/certificates' },
            { label: 'Analytics', slug: 'docs/features/analytics' },
            { label: 'Upstream Health', slug: 'docs/features/upstream-health' },
            { label: 'Docker Networks', slug: 'docs/features/docker-networks' },
            { label: 'Scanner', slug: 'docs/features/scanner' },
            { label: 'Audit Log', slug: 'docs/features/audit-log' },
          ],
        },
        {
          label: 'Deployment',
          items: [
            { label: 'Behind Cloudflare Tunnel', slug: 'docs/deployment/behind-cloudflare-tunnel' },
            { label: 'Behind Another Proxy', slug: 'docs/deployment/behind-another-proxy' },
            { label: 'Direct LAN', slug: 'docs/deployment/direct-lan' },
            { label: 'Tailscale', slug: 'docs/deployment/tailscale' },
            { label: 'Trusted Proxies', slug: 'docs/deployment/trusted-proxies' },
          ],
        },
        {
          label: 'Troubleshooting',
          items: [
            { label: 'Problem Index', slug: 'docs/troubleshooting/index' },
            { label: 'Not Authenticated', slug: 'docs/troubleshooting/not-authenticated' },
            { label: 'Holding Page Shown', slug: 'docs/troubleshooting/holding-page-shown' },
            { label: 'Mixed Content Errors', slug: 'docs/troubleshooting/mixed-content-errors' },
            { label: '502 Bad Gateway', slug: 'docs/troubleshooting/502-bad-gateway' },
            { label: 'Cloudflared DNS Errors', slug: 'docs/troubleshooting/cloudflared-dns-errors' },
            { label: 'HTTPS Upstream Refused', slug: 'docs/troubleshooting/https-upstream-connection-refused' },
            { label: 'Upstream Health Failed', slug: 'docs/troubleshooting/upstream-health-failed' },
            { label: 'Routes Not Saving', slug: 'docs/troubleshooting/routes-not-saving' },
            { label: "Container Won't Start", slug: 'docs/troubleshooting/container-wont-start' },
            { label: 'Cookie Not Persisting', slug: 'docs/troubleshooting/cookie-not-persisting' },
            { label: 'Secret Rotation Logout', slug: 'docs/troubleshooting/secret-rotation-logout' },
          ],
        },
        {
          label: 'Admin',
          items: [
            { label: 'Environment Variables', slug: 'docs/admin/environment-variables' },
            { label: 'Secrets Management', slug: 'docs/admin/secrets-management' },
            { label: 'Logging', slug: 'docs/admin/logging' },
            { label: 'Database', slug: 'docs/admin/database' },
            { label: 'Backup & Restore', slug: 'docs/admin/backup-and-restore' },
            { label: 'Upgrades', slug: 'docs/admin/upgrades' },
            { label: 'Security Hardening', slug: 'docs/admin/security-hardening' },
          ],
        },
        {
          label: 'API',
          items: [
            { label: 'Authentication', slug: 'docs/api/authentication' },
            { label: 'Routes Endpoints', slug: 'docs/api/routes-endpoints' },
            { label: 'Scopes & Permissions', slug: 'docs/api/scopes-and-permissions' },
          ],
        },
      ],
    }),
  ],
})
