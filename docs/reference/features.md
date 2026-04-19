# Feature Reference

---

## Routing

| Feature | What it does | UI location | Key options |
|---|---|---|---|
| Routes | Create and manage reverse proxy routes | Routes | Domain, upstream, TLS mode, WebSocket, HTTP/2+3, compression |
| Headers | Add/remove/rewrite request and response headers | Route editor → Headers | Header name, value, action (set/add/remove) |
| Templates | Create a route from a pre-built template | Routes → New Route → Templates | Template selection |
| Route import | Import routes from Traefik labels or docker-compose files | Routes → Import | Source file or Docker label scan |
| Docker Scanner | Auto-detect containers and suggest routes | Routes → Docker Scanner | Container list, label parsing |
| Blue-green deploys | Switch upstream traffic between two versions | Automation → Blue-Green | Active/standby upstream addresses |
| Traffic replay | Replay recorded traffic against a new upstream | Automation → Replay | Source route, target upstream, rate |

---

## Security

| Feature | What it does | UI location | Key options |
|---|---|---|---|
| TLS / Certificates | Per-route certificate management | Route editor → TLS | Mode: auto / dns / internal / off |
| WAF | Coraza-based Web Application Firewall | Route editor → WAF | Rule sets, block/log mode |
| SSO | OAuth2 authentication gate per route | Route editor → SSO | Provider, session duration, email filter |
| Access Lists | IP allowlist or denylist per route | Access Lists | CIDR ranges, allow/deny action |
| AccessOS | Group-based ACLs tied to SSO identity | Settings → AccessOS | Group definition, route assignment |
| API Keys | Machine-to-machine authentication tokens | Settings → API Keys | Key name, permissions, expiry |
| Secrets | Inject secrets from LockBoxOS, Vault, or env | Route editor → Secrets | Provider, key name |

---

## Observability

| Feature | What it does | UI location | Key options |
|---|---|---|---|
| Analytics | Traffic metrics from Caddy access log | Analytics | Time range, route filter |
| Live heatmap | Real-time request activity | Analytics → Live | Auto-refresh |
| Slow request log | Requests exceeding latency threshold | Analytics → Slow Requests | Threshold (ms) |
| Prometheus metrics | Scraped `/metrics` endpoint | Settings → Observability | Endpoint path, auth |
| Cert health | Certificate expiry monitoring | Observability → Cert Health | Expiry warning days |
| CT monitor | Certificate Transparency log watcher | Observability → CT Monitor | Domain watch list |
| Monitors | Custom health checks per route | Monitors | URL, interval, expected status |
| Alerts | Threshold-based alerting | Alerts | Metric, threshold, window, notification channel |
| Notifications | Alert delivery channels | Settings → Notifications | Email, webhook, Slack |
| Audit log | Full audit trail of config changes | Settings → Audit Log | Actor, action, timestamp |

---

## Automation

| Feature | What it does | UI location | Key options |
|---|---|---|---|
| Scheduled changes | Apply route config changes on a schedule | Automation → Scheduled | Route, change type, cron expression |
| DDNS updater | Update DNS records when IP changes | Automation → DDNS | Provider, domain, check interval |
| Config drift detection | Detect when Caddy config diverges from DB | Automation → Drift | Check interval, alert on drift |
| Health checks | Per-route upstream health scoring | Automation → Health | Check URL, thresholds |
| Health scoring | Aggregate health score across routes | Dashboard | Score display |
| PatchOS | Maintenance mode per route (serve a maintenance page) | Route editor → PatchOS | Maintenance page URL, schedule |
| Service Chain | Visual debugger for route → upstream path | Chain → Debugger | Route selection |
| Chain health | Health status along the full chain | Chain → Health | Visual status |

---

## Integrations

| Feature | What it does | UI location | Key options |
|---|---|---|---|
| Cloudflare DNS-01 | DNS challenge for certificate issuance | env: `CLOUDFLARE_API_TOKEN` | API token, zone |
| MxWatch | MX/email deliverability monitoring per route domain | MxWatch | Domain, check interval |
| InfraOS API | External API to create/manage routes via token | Settings → InfraOS | API token |
| LockBoxOS | Secrets provider integration | Settings → Secrets | LockBoxOS endpoint |
| Vault | HashiCorp Vault secrets provider | Settings → Secrets | Vault address, token |
| Billing | Lemon Squeezy subscription management | Settings → Billing | Plan, usage |

---

## Admin

| Feature | What it does | UI location | Key options |
|---|---|---|---|
| Organizations | Multi-tenant organisation management | Settings → Organizations | Org name, members |
| Sites | Group routes into logical sites | Settings → Sites | Site name, route assignment |
| RBAC | Role-based access control | Settings → Organizations | Roles: admin / editor / viewer |
| Backup / Restore | Export and import full config | Settings → Backup | Export format, dry-run import |
| Federation | Manage remote ProxyOS nodes | Federation | Node enrollment, sync status |
| User management | Invite and manage users | Settings → Users | Email, role |
