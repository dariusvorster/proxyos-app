# ProxyOS — Complete UI/UX Design Spec
## Version 2.0 · April 2026

---

## Table of Contents

1. [Brand & Identity](#1-brand--identity)
2. [Design Tokens](#2-design-tokens)
3. [Logo Usage](#3-logo-usage)
4. [Layout Shell](#4-layout-shell)
5. [Page: Dashboard](#5-page-dashboard)
6. [Page: Routes](#6-page-routes)
7. [Page: Analytics](#7-page-analytics)
8. [Page: Certificates](#8-page-certificates)
9. [Page: Agents](#9-page-agents)
10. [Page: Scanner](#10-page-scanner)
11. [Page: Import](#11-page-import)
12. [Page: Audit Log](#12-page-audit-log)
13. [Page: Settings](#13-page-settings)
14. [Wizard: Expose Service](#14-wizard-expose-service)
15. [Components](#15-components)
16. [Browser Identity](#16-browser-identity)
17. [Responsive Behaviour](#17-responsive-behaviour)

---

---

## 1. Brand & Identity

### Product name
**ProxyOS** — one word, capital P, capital OS. Never "Proxy OS", never "proxyos".

### Tagline
"Route · Secure · Observe"

### Positioning
ProxyOS is infrastructure software for developers and homelab operators. The aesthetic is dark, precise, and technical — not playful, not enterprise-grey. It should feel like something a Cadillac engineer would use, not something a startup founder demo-ed on stage.

### Theme
**Night purple.** The primary theme is dark mode with a deep navy-purple canvas and violet accent system. A light mode (lavender) exists for users who prefer it but dark is the default and the hero.

---

## 2. Design Tokens

### Colour — Purple brand ramp

| Token | Hex | Usage |
|---|---|---|
| `--pu-50` | `#F0EFFE` | Light backgrounds, light mode sidebar |
| `--pu-100` | `#D8D4FC` | Light mode borders, hover fills |
| `--pu-200` | `#B9B2F7` | Light mode secondary text |
| `--pu-400` | `#7C6FF0` | Active nav accent, badge fills |
| `--pu-500` | `#5C52D9` | Hover states |
| `--pu-600` | `#4338CA` | **Primary action colour** — buttons, active states |
| `--pu-700` | `#3730A3` | Button hover |
| `--pu-800` | `#2D2880` | Dark mode heading text |
| `--pu-900` | `#1E1B5E` | Deep fills, icon backgrounds |

### Colour — Night ramp (dark mode surfaces)

| Token | Hex | Usage |
|---|---|---|
| `--night-deep` | `#0F0D22` | Page canvas / content background |
| `--night-50` | `#1A1730` | Sidebar, topbar, card backgrounds |
| `--night-100` | `#231F42` | Hover fills |
| `--night-200` | `#2E2A55` | Elevated cards, badge backgrounds |
| `--night-300` | `#3D3870` | Borders, dividers |
| `--night-400` | `#4C4690` | Subtle text, icons |

### Colour — Text (dark mode)

| Token | Hex | Usage |
|---|---|---|
| `--text-primary` | `#C4BFFB` | Main body text, table values |
| `--text-secondary` | `#9D93F5` | Secondary values, labels |
| `--text-muted` | `#7C6FF0` | Section titles, card headers |
| `--text-dim` | `#534AB7` | Timestamps, metadata |
| `--text-ghost` | `#3D3870` | Column headers, disabled |

### Colour — Semantic

| Token | Dark hex | Usage |
|---|---|---|
| `--green` | `#34C88A` | Online, healthy, success |
| `--green-bg` | `#0A2820` | Green badge background |
| `--amber` | `#E2A84B` | Warning, expiring, degraded |
| `--amber-bg` | `#2A1E0A` | Amber badge background |
| `--red` | `#E24B4A` | Error, offline, down |
| `--red-bg` | `#2A0A0A` | Red badge background |

### Typography

| Role | Font | Size | Weight |
|---|---|---|---|
| Logo wordmark | System sans / `--font-sans` | 14px | 500 |
| Page title | `--font-sans` | 14px | 500 |
| Section title (card header) | `--font-sans` | 11px | 500 |
| Body / table values | `--font-sans` | 11–13px | 400 |
| Labels / column headers | `--font-sans` | 10px | 500 |
| Monospace (IPs, ports, paths) | `--font-mono` | 10–11px | 400 |
| Badges | `--font-sans` | 9–10px | 500 |
| Nav items | `--font-sans` | 12px | 400 (500 when active) |

### Spacing

- Base unit: 4px
- Component inner padding: 8px / 12px / 16px
- Section gaps: 14px / 16px / 20px
- Sidebar width: 210px
- Topbar height: 42px
- Border radius — cards: 8px; marks/icons: 12px; badges: 3px; pills: 20px

### Borders

All borders: `0.5px solid` — never 1px. Dark mode border colours:
- Default: `rgba(124, 111, 240, 0.15)`
- Emphasis: `rgba(124, 111, 240, 0.25)`
- Active accent: `2px solid #7C6FF0` (right edge of active nav item only)

---

## 3. Logo Usage

### The mark

The ProxyOS logomark is the **key/proxy mark**: a circle with an inner ring on the left (the source node), a horizontal connector bar, branching via a vertical stem into two rounded rectangles on the right (the destinations). This represents one source routing to two upstream targets — the core reverse proxy pattern.

```
  ●━━━━┳━━[  ]
       ┗━━[  ]
```

The mark is always rendered as SVG inline — never an `<img>` tag. This ensures it renders crisply at all sizes.

### SVG source (canonical — copy this exactly everywhere)

```svg
<!-- 64×64 icon (sidebar, favicon, tabs) -->
<svg width="26" height="26" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="12" fill="#7C6FF0"/>
  <!-- source circle -->
  <circle cx="18" cy="32" r="8" fill="#F0EFFE"/>
  <circle cx="18" cy="32" r="4" fill="#4338CA"/>
  <!-- horizontal connector -->
  <rect x="26" y="30" width="8" height="4" fill="#F0EFFE"/>
  <!-- vertical stem -->
  <line x1="36" y1="32" x2="36" y2="44" stroke="#F0EFFE" stroke-width="3"/>
  <!-- destination top -->
  <rect x="30" y="22" width="14" height="10" rx="3" fill="#F0EFFE"/>
  <!-- destination bottom (slightly dimmer) -->
  <rect x="30" y="40" width="14" height="10" rx="3" fill="#F0EFFE" opacity="0.65"/>
  <!-- connector to top dest -->
  <line x1="36" y1="27" x2="36" y2="32" stroke="#F0EFFE" stroke-width="3"/>
</svg>
```

### Size variants

| Context | Size | Notes |
|---|---|---|
| Sidebar logo | 26×26 | With wordmark "ProxyOS" at 14px/500 |
| Chrome tab favicon | 14×14 | Viewbox scaled, no wordmark |
| Address bar | 12×12 | Viewbox scaled |
| App icon (Docker, mobile) | 256×256 | Larger rx="20" on outer rect |
| OG image / marketing | 512×512 | Larger rx="24" |

### Logo background

The icon background is always `#7C6FF0` (pu-400). Never transparent, never dark, never white. The purple square with rounded corners IS part of the logo.

### Wordmark

"ProxyOS" in `--font-sans` 14px weight 500, colour `#C4BFFB` on dark backgrounds, `#2D2880` on light backgrounds. Always paired with the mark, never standalone.

### Version badge

`v2` badge displayed inline next to wordmark: 9px, background `#0F0D22`, colour `#7C6FF0`, border-radius 3px, padding 1px 5px.

### What never changes

- Do not recolour the mark
- Do not remove the inner ring from the source circle
- Do not change the two-destination structure
- Do not add animation to the logo mark itself
- Do not use the mark without the purple background square

---

## 4. Layout Shell

### Structure

```
┌─────────────────────────────────────────────────┐
│  Chrome tab bar (favicon + "ProxyOS — {Page}")   │
│  Chrome address bar (favicon + URL)              │
├──────────────┬──────────────────────────────────┤
│              │  Topbar (42px)                    │
│   Sidebar    │  ─────────────────────────────   │
│   (210px)    │                                   │
│              │  Content area                     │
│              │  (padding: 16px 18px)             │
│              │                                   │
└──────────────┴──────────────────────────────────┘
```

### Sidebar

Background: `#1A1730`
Border-right: `0.5px solid rgba(124,111,240,0.15)`

**Logo row** (padding 13px 16px):
- Mark (26×26) + wordmark + v-badge
- Border-bottom: `0.5px solid rgba(124,111,240,0.15)`
- Margin-bottom: 6px

**Nav items** (padding 7px 16px, font-size 12px):
- Default: `rgba(157,147,245,0.5)`
- Hover: background `rgba(124,111,240,0.08)`, text `#C4BFFB`
- Active: background `rgba(124,111,240,0.18)`, text `#C4BFFB`, weight 500, `border-right: 2px solid #7C6FF0`
- Icon: 14×14, opacity 0.6 (1.0 when active)

**Nav sections** (labels like "Federation", "Tools"):
- Font-size 9px, weight 500, `rgba(124,111,240,0.3)`, uppercase, letter-spacing 0.08em
- Padding 10px 16px 3px

**Nav order:**
1. Dashboard
2. Routes
3. Analytics
4. Certificates
5. *(section: Federation)*
6. Agents
7. Scanner
8. *(section: Tools)*
9. Import
10. Audit log
11. *(spacer pushing to bottom)*
12. Settings

### Topbar

Background: `#1A1730`
Border-bottom: `0.5px solid rgba(124,111,240,0.15)`
Height: 42px
Padding: 11px 18px

Left: page title (14px/500, `#C4BFFB`)
Right: contextual action buttons

### Content area

Background: `#0F0D22`
Padding: 16px 18px
Display: flex, flex-direction: column, gap: 14px

---

## 5. Page: Dashboard

**Route:** `/`
**Title:** "Dashboard"
**Topbar actions:** Scanner button (ghost), Import button (ghost), + Expose service (primary)

### Stat cards row

4-column grid, gap 8px. Each stat card:
- Background: `#1A1730`
- Border: `0.5px solid rgba(124,111,240,0.15)`
- Border-radius: 8px
- Padding: 11px 13px

Fields:
- Label (10px, `#534AB7`)
- Value (20px/500, `#C4BFFB`)
- Sub-line (10px, semantic colour)

**4 cards:**
1. Active routes — value + "All upstreams healthy" (green) or "N upstream(s) down" (red)
2. Agents online — "N / M" format + "N agent offline" (amber) or "All online" (green)
3. Requests / 24h — formatted (142k) + delta vs yesterday
4. Certs expiring — count + "Within 14 days" (amber) or "None expiring" (green)

### Routes table card

Header: "Routes" (left) + "View all →" link (right)

Columns (table-layout: fixed):
| Column | Width | Notes |
|---|---|---|
| Domain | 27% | Bold, `#C4BFFB` |
| Upstream | 19% | Monospace, `#534AB7` |
| Agent | 11% | Badge |
| TLS | 9% | Badge (green=auto, amber=internal, green=dns) |
| SSO | 12% | Badge (purple=provider, grey=none) |
| Req/h | 8% | `#7C6FF0` |
| Status | 14% | Dot + text |

Show 5–8 rows maximum on dashboard. Full table on /routes.

### Bottom two-column grid

Left: **Agents card**
- Each row: dot + agent name (bold) / meta line (10px, dim) / status badge
- Meta shows: connectivity method + route count

Right: **Certificates card**
- Each row: domain + progress bar (72px wide, 3px tall) + days remaining + issuer
- Progress bar colour: green (>30d), amber (8–30d), red (<8d)

---

## 6. Page: Routes

**Route:** `/routes`
**Title:** "Routes"
**Topbar actions:** Filter dropdown, Agent filter, + Expose service (primary)

### Filter bar (below topbar, above table)

Horizontal pill row:
- "All agents" dropdown
- "All TLS modes" dropdown
- "All SSO" dropdown
- Search input (domain search)
- "N routes" count (right-aligned)

### Full routes table

All columns from dashboard table plus:
- Checkbox column (leftmost, for bulk actions)
- p95 latency column
- Last request column

**Bulk action bar** (appears when rows checked):
- "N selected" label
- Disable / Enable / Delete / Move to agent / Clone buttons

**Row click:** Opens route detail side panel (slides in from right, 400px wide)

### Route detail side panel

Header: domain name + status dot + close button

Sections:
1. **Upstream** — IP:port, health status, last check time
2. **TLS** — mode, cert expiry, issuer, renew button
3. **SSO** — toggle + provider + forward auth URL
4. **Access** — IP allowlist, rate limit (rpm), basic auth
5. **Options** — compression, WebSocket, HTTP/3, health check path
6. **Traffic (24h)** — tiny sparkline chart (req/s over 24h)
7. **Actions** — Edit, Disable, Delete (destructive, red)

---

## 7. Page: Analytics

**Route:** `/analytics`
**Title:** "Analytics"
**Topbar actions:** Time range picker (24h / 7d / 30d), Route filter dropdown, Export CSV

### Summary stat row

6 cards:
1. Total requests (selected period)
2. Error rate %
3. p50 latency
4. p95 latency
5. Bandwidth in
6. Bandwidth out

### Main chart

Full-width line chart: requests/minute over selected period
- X axis: time
- Y axis: requests
- Two lines: total requests (purple) + errors (red)
- Hover tooltip: exact values + error count

### Per-route table

Columns: Route, Requests, Error rate, p50, p95, Bandwidth, Trend (sparkline)
Sortable by any column.
Click row → navigates to `/analytics/[routeId]`

### Route detail analytics page (`/analytics/[routeId]`)

- Req/s chart (1m buckets, 24h window)
- Error rate chart
- Latency distribution (p50 / p95 / p99)
- Top paths table
- Top IPs table
- Status code breakdown (200 / 3xx / 4xx / 5xx)
- Live log tail (last 50 entries, auto-refresh)

---

## 8. Page: Certificates

**Route:** `/certificates`
**Title:** "Certificates"
**Topbar actions:** + Add custom cert

### Status summary bar

3 inline stats:
- N active certs
- N expiring (amber, <30d)
- N critical (red, <7d)

### Certificates table

Columns:
| Column | Notes |
|---|---|
| Domain | Bold |
| Issuer | Let's Encrypt / ZeroSSL / Internal CA / Custom |
| Mode | auto / dns / internal / custom |
| Issued | Date |
| Expires | Date + days remaining |
| Status | Progress bar + colour-coded days |
| Agent | Which agent holds this cert |
| Actions | Renew / Revoke / Download |

**Row colour coding:**
- Default: normal
- Amber row: 8–30d remaining
- Red row background (subtle): <8d remaining

### Internal CA panel

Collapsible section below the table. Shows:
- CA root cert fingerprint
- Expiry date
- Download root cert button (for trust store installation)
- Regenerate CA button (destructive, requires confirmation)

---

## 9. Page: Agents

**Route:** `/agents`
**Title:** "Agents"
**Topbar actions:** + Register agent

### Federation health banner

Full-width card at top:
- N/M agents online (large number)
- Total routes across all agents
- Any alerts (amber/red inline badges)

### Agents table

Columns:
| Column | Notes |
|---|---|
| Agent name | Bold + status dot |
| Site tag | Coloured badge |
| Connectivity | WireGuard / Tailscale / Direct TLS / CF Tunnel |
| Status | online / offline / error |
| Last seen | Relative time |
| Routes | Count |
| Caddy version | Monospace |
| Actions | View / Edit / Revoke token / Delete |

Click row → `/agents/[id]`

### Agent detail page (`/agents/[id]`)

**Header:** Agent name + status dot + last seen

**Tabs:**
1. Routes — routes assigned to this agent (same table as /routes but filtered)
2. Metrics — req/s, error rate, p95 per route on this agent (charts)
3. Health — upstream health check results, Caddy process status
4. Certificates — certs held by this agent
5. Logs — live log tail from this agent (streamed via WebSocket)
6. Settings — rename, change site tag, rotate token

### Register agent wizard (`/agents/new`)

3 steps:

**Step 1 — Details:**
- Agent name input
- Site tag (new or existing dropdown)
- Description (optional)
- Connectivity method (for documentation only — doesn't affect config)

**Step 2 — Token:**
- Token generated and displayed (copy button)
- Warning: "This token is shown once — copy it now"
- Token expires: 1 year (shown)
- Central fingerprint embedded in token (shown as SHA256)

**Step 3 — Install:**
- Docker run snippet pre-filled with CENTRAL_URL, AGENT_TOKEN, AGENT_ID
- docker-compose.yml snippet alternative
- "Waiting for agent to connect..." spinner
- Auto-advances when agent comes online

---

## 10. Page: Scanner

**Route:** `/scan`
**Title:** "Scanner"
**Topbar actions:** Agent selector (which host to scan), Scan now button, Auto-watch toggle

### Scanner header strip

- Last scan: relative time
- N containers found
- N already configured
- N suggestions

### Container list

Each container is a card row:

```
[status icon]  container-name          image:tag
               Suggestion: app.domain.com → :3000
               Strategy: ProxyOS labels · High confidence
               [One-click Expose]  [Review & Expose]  [Dismiss]
```

**Status icons:**
- Green checkmark = already configured
- Purple dot = ready to expose (high confidence)
- Amber dot = needs review (medium confidence)
- Grey dash = no HTTP port / skipped

**One-click Expose** (high confidence, full labels): creates route immediately, no wizard
**Review & Expose** (medium/heuristic): opens expose wizard pre-filled
**Dismiss**: hide from scan results permanently

### Compose file parser

Secondary section below container list:
- "Parse docker-compose.yml" upload zone
- Drag-and-drop or click to upload
- Shows parsed services + suggestions same as live scan

### Auto-watch settings panel

Collapsible:
- Mode: Notify only / Auto-expose (labels only) / Auto-expose (all high-confidence)
- Notify channel: Dashboard only / Email / Webhook
- Ignored containers: list of dismissed container IDs

---

## 11. Page: Import

**Route:** `/import`
**Title:** "Import"
**Topbar actions:** Import history link

### Import wizard

5-step modal/page (full page on /import, not a modal):

**Step indicator** — horizontal bar across top, steps: Source → Input → Preview → Options → Import

---

**Step 1 — Source**

6 source cards in 3×2 grid:
- Nginx Proxy Manager (High fidelity badge, green)
- Traefik (High fidelity badge, green)
- Caddy (Perfect badge, green)
- Nginx (High fidelity, green)
- Apache (Medium fidelity, amber)
- HAProxy (Medium fidelity, amber)

Each card: source name + fidelity badge + 1-line description. Click to select (border highlights).

---

**Step 2 — Input**

Varies by source:

*NPM:* File upload zone for `database.sqlite` OR MySQL connection string input
*Traefik:* API URL input + "Test connection" button, OR file upload (YAML/TOML), OR "Scan Docker labels" button
*Caddy:* Admin API URL (pre-filled with `http://localhost:2019`) + "Test connection", OR file upload
*Nginx:* File upload zone (single .conf or .zip of sites-enabled/)
*Apache:* File upload zone
*HAProxy:* File upload zone

All: OR divider between live input and file upload.

---

**Step 3 — Preview**

Summary bar: N detected / N ready / N need review / N already configured

Table: checkbox | Domain | Upstream | TLS | SSO | Confidence | Status
- Amber rows = needs review (hover shows warning tooltip)
- Already configured rows = dimmed + "exists" badge

Row click: opens inline edit panel to adjust before import.

---

**Step 4 — Options**

Two-column option grid:
- Assign to agent (dropdown)
- Default TLS mode (dropdown)

Toggle list:
- Dry run (validate without committing)
- Skip already configured routes
- Prompt SSO per route
- Start cert provisioning immediately

Summary line: "N routes will be created, M skipped, K need review"

---

**Step 5 — Import (result)**

If dry run: shows validation results table. "Run import" button.

If real import: animated progress (each route ticked off). Then completion summary:
- N imported (green)
- N skipped (grey)
- N need review (amber)
- N failed (red, with error detail expandable)

Actions: "Back to dashboard" / "View routes" / "Download report (JSON)"

### Import history (`/import/history`)

Table: Date | Source | Routes imported | Skipped | Failed | Download report

---

## 12. Page: Audit Log

**Route:** `/audit`
**Title:** "Audit log"
**Topbar actions:** Export CSV, Filter by action type

### Filter bar

- Date range picker
- Action type filter (route.created / cert.renewed / agent.registered / etc.)
- Search by domain or user

### Log table

Columns: Timestamp | Action | Subject | Details | Agent | Result

Each row expandable to show full payload diff (before/after for changes).

**Action types and colours:**
- `route.created` → green
- `route.updated` → blue (purple)
- `route.deleted` → red
- `cert.renewed` → green
- `cert.expiring` → amber
- `agent.registered` → green
- `agent.offline` → amber
- `agent.token_revoked` → red
- `sso.enabled` → purple
- `import.completed` → green

---

## 13. Page: Settings

**Route:** `/settings`
**Title:** "Settings"

### Sections (vertical nav within settings):

**General**
- ProxyOS instance name
- Base domain hint (used by scanner for subdomain suggestions)
- Timezone

**Alerts**
- Email: SMTP config, test button, alert recipients
- Webhook: URL input, event filter checkboxes, test button
- Alert thresholds: cert expiry warning days, error rate %, upstream down timeout

**SSO Providers**
- List of configured providers (Authentik, Authelia)
- Each: name, URL, test connection, edit, delete
- Add provider button

**DNS Providers** (for DNS-01 TLS)
- Cloudflare: API token input
- Route53 (V2): access key + secret
- Hetzner DNS (V2): API token

**Infra OS Integration**
- InfraOS URL + API key
- Sync status + last synced timestamp
- Manual sync button

**Export**
- Export all routes as: Caddyfile / Nginx config / Traefik labels / ProxyOS JSON
- Export certificates inventory CSV

**Danger zone**
- Reset Caddy config (rebuilds from DB — useful if Caddy drifted)
- Wipe all routes (requires typing "DELETE" to confirm)
- Factory reset

---

## 14. Wizard: Expose Service

**Trigger:** "+ Expose service" button (topbar on dashboard/routes)
**Presentation:** Full-page overlay that slides in from the right over the content area (not a modal — the sidebar stays visible)

### Step indicator

5 steps shown as numbered horizontal track:
1. Source
2. Domain
3. Access
4. Options
5. Review

Active step: purple filled circle. Done step: green checkmark circle. Upcoming: grey circle.

---

**Step 1 — Source**

Two input modes toggled by tab:

*Manual:* IP address input + port input + protocol toggle (HTTP/HTTPS)

*From Infra OS:* Grid of discovered services pulled from InfraOS topology. Each card shows: service name, host, port, container/VM icon. Click to select.

*From Scanner:* List of scanner suggestions not yet configured. Click to pre-fill.

Upstream preview: `http://192.168.69.25:5678` shown live as user types.

---

**Step 2 — Domain**

- Domain input (full domain, e.g. `n8n.homelabza.com`)
- TLS mode selector (5 radio cards):
  - auto — Let's Encrypt / ZeroSSL
  - dns — DNS-01 (shows DNS provider dropdown if selected)
  - internal — Caddy CA
  - custom — upload cert/key
  - off — HTTP only (shows red warning)
- Live domain validation (checks DNS resolves, shows result)

---

**Step 3 — Access**

- **SSO toggle** (large, prominent): OFF by default. When toggled ON:
  - Provider dropdown (Authentik / Authelia / configured providers)
  - Forward auth URL shown (read-only, generated)
  - Copy headers list shown

- **IP allowlist**: text input, comma-separated CIDRs. "Add my current IP" helper link.

- **Basic auth**: toggle + username/password inputs (shown when toggled)

---

**Step 4 — Options**

Toggle list:
- Rate limiting: toggle + RPM input (default 100)
- Compression: toggle (default on)
- WebSocket support: toggle
- HTTP/3 (QUIC): toggle (default on)
- Upstream health check: toggle + path input (default `/`)
- Custom request headers: key/value pairs add button

---

**Step 5 — Review**

Summary card showing all configured values. Two-column layout:

Left column:
- Source → Upstream URL
- Domain → domain + TLS mode
- SSO → provider or "disabled"

Right column:
- Agent → which agent will receive this route
- Rate limit → N rpm or "off"
- Options summary → comma-separated active options

**Caddy config preview** (collapsible): shows the exact JSON that will be sent to Caddy Admin API.

**"Expose" button** (full width, primary purple).

---

**Post-expose state:**

Inline success card replaces review:
- Green checkmark + "Route live in Caddy"
- "Certificate provisioning started" with animated progress indicator
- Route summary
- Quick links: View route analytics / Edit route / Back to dashboard

---

## 15. Components

### Badge

```
Background: semantic-bg colour
Text: semantic colour
Font-size: 9–10px
Font-weight: 500
Padding: 2px 6px
Border-radius: 3px
```

Variants: purple (agent, SSO), green (auto TLS, online, success), amber (warning, internal), red (error, offline), grey (none, local)

### Status dot

6×6px circle, inline-block, margin-right 5px
Colours: green `#34C88A`, amber `#E2A84B`, red `#E24B4A`, grey `#3D3870`

### Toggle

32×18px pill
- ON: background `#4338CA`, knob translates right
- OFF: background `rgba(124,111,240,0.2)`, knob left
- Transition: 0.15s

### Checkbox

14×14px, border-radius 3px
- Unchecked: border `1px solid rgba(124,111,240,0.3)`, background transparent
- Checked: background `#4338CA`, white checkmark SVG

### Buttons

**Primary:** background `#4338CA`, text `#F0EFFE`, border none, padding 6px 13px, border-radius 7px, font-size 12px/500
**Ghost:** background transparent, border `0.5px solid rgba(124,111,240,0.3)`, text `#9D93F5`
**Danger:** background `#2A0A0A`, border `0.5px solid rgba(226,75,74,0.3)`, text `#E24B4A`

Hover: primary darkens to `#3730A3`. Ghost fills to `rgba(124,111,240,0.08)`.

### Input fields

Background: `#1A1730`
Border: `0.5px solid rgba(124,111,240,0.25)`
Border-radius: 6px
Padding: 7px 10px
Font-size: 12px
Text: `#C4BFFB`
Placeholder: `#3D3870`
Focus: border-color `#7C6FF0`, no outline

### Card

Background: `#1A1730`
Border: `0.5px solid rgba(124,111,240,0.18)`
Border-radius: 8px
Overflow: hidden

Card header:
- Background: `rgba(46, 42, 85, 0.35)`
- Border-bottom: `0.5px solid rgba(124,111,240,0.12)`
- Padding: 8px 13px
- Title: 11px/500, `#7C6FF0`

### Table

```
th: 10px/500, #3D3870, padding 7px 12px
    border-bottom: 0.5px solid rgba(124,111,240,0.10)
    background: rgba(26,23,48,0.5)

td: 11px, #9D93F5, padding 8px 12px
    border-bottom: 0.5px solid rgba(124,111,240,0.06)

tr:hover td: background rgba(124,111,240,0.04)
tr:last-child td: border-bottom none
```

table-layout: fixed on all tables. Always set explicit column widths.

### Progress bar

Height: 3px
Background track: `#1E1B30`
Border-radius: 2px
Fill: green / amber / red based on value
Width: typically 72–80px in cert list, 100% in wizard

### Stat card (dashboard)

Background: `#1A1730`
Border: `0.5px solid rgba(124,111,240,0.15)`
Border-radius: 8px
Padding: 11px 13px
Label: 10px, `#534AB7`
Value: 20px/500, `#C4BFFB`
Sub: 10px, semantic colour

### Alert banner

Full-width, shown below topbar when critical state:
- Red variant: `background #2A0A0A`, `border-bottom 0.5px solid rgba(226,75,74,0.3)`
- Amber variant: `background #2A1E0A`, `border-bottom 0.5px solid rgba(226,168,75,0.3)`
- Text: semantic colour
- Dismiss button: right-aligned ✕

---

## 16. Browser Identity

### Favicon

The 16×16 and 32×32 favicon is the ProxyOS logomark SVG embedded as a data URI in `<link rel="icon">`. No PNG fallback needed — SVG favicons work in all modern browsers.

```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,...">
```

The SVG at small sizes simplifies: the outer rect + source circle (filled, no inner ring) + connector bar + two destination rects. The inner ring of the source circle is dropped at 16px as it becomes noise.

### Page title format

```
ProxyOS — {Page Name}
```

Examples:
- `ProxyOS — Dashboard`
- `ProxyOS — Routes`
- `ProxyOS — Agents`
- `ProxyOS — n8n.homelabza.com` (when viewing a specific route)

### Chrome tab appearance

Tab favicon: 14×14 logomark
Tab title: `ProxyOS — {Page}`
Address bar: 12×12 logomark + `proxy.homelabza.com` (or whatever the user's domain is)

### OG / Social meta

```html
<meta property="og:image" content="/og.png">  <!-- 1200×630, dark purple bg, large centered mark + wordmark -->
<meta property="og:title" content="ProxyOS">
<meta property="og:description" content="Route · Secure · Observe">
```

---

## 17. Responsive Behaviour

ProxyOS is a desktop-first application. The minimum supported width is 1024px. Below that, a "use on desktop" message is shown.

### Breakpoints

| Breakpoint | Behaviour |
|---|---|
| ≥1280px | Full layout as specced |
| 1024–1279px | Sidebar collapses to icons-only (44px wide), tooltips on hover |
| <1024px | "Desktop required" splash |

### Collapsed sidebar (1024–1279px)

- Width: 44px
- Show mark only (no wordmark)
- Nav items: icon only, label in tooltip on hover
- Section labels hidden
- Settings icon at bottom retained

### Print / export

No print styles needed — this is a web app, not a document tool.

---

*ProxyOS UI/UX Design Spec — v2.0 — proxyos.app — Homelab OS family*
