# ProxyOS — UI/UX Design Spec v3.0
## Built on the Homelab OS Family Design System (MxWatch baseline)

**Version:** 3.0  
**Date:** April 2026  
**Design system:** MxWatch baseline — all OS family products share this system  
**Supersedes:** proxyos-ui-spec.md (v2.0)

---

## IMPORTANT: OS Family Design Standard

This spec defines the canonical UI for ProxyOS AND the shared design system for all Homelab OS products. Every product in the family — MxWatch, ProxyOS, BackupOS, InfraOS, LockBoxOS, PatchOS, AccessOS — uses this exact design system. Only the accent colour and logo mark change per product.

**Per-product accent colours:**
- MxWatch — blue (`--blue: #185FA5 / #4A9EFF`)
- ProxyOS — purple (`--accent: #7C6FF0 / #9D8FFF`) — logo mark background stays `#7C6FF0`
- BackupOS — amber (`--accent: #854F0B / #F5A623`)
- InfraOS — green (`--accent: #0F6E56 / #00C896`)
- LockBoxOS — purple (same as ProxyOS, different mark)
- PatchOS — red (`--accent: #A32D2D / #F55A5A`)
- AccessOS — teal

Everything else — fonts, spacing, border radii, surface colours, semantic colours, component structure, layout shell — is identical across all products.

---

## Table of Contents

1. [Design Tokens](#1-design-tokens)
2. [Typography](#2-typography)
3. [Logo & Brand](#3-logo--brand)
4. [Layout Shell](#4-layout-shell)
5. [Page: Dashboard](#5-page-dashboard)
6. [Page: Routes](#6-page-routes)
7. [Page: Analytics](#7-page-analytics)
8. [Page: Certificates](#8-page-certificates)
9. [Page: Agents](#9-page-agents)
10. [Page: Connections](#10-page-connections)
11. [Page: Scanner](#11-page-scanner)
12. [Page: Import](#12-page-import)
13. [Page: Audit Log](#13-page-audit-log)
14. [Page: Settings](#14-page-settings)
15. [Wizard: Expose Service (V3)](#15-wizard-expose-service-v3)
16. [Component Library](#16-component-library)
17. [Browser Identity](#17-browser-identity)
18. [Dark/Light Mode](#18-darklight-mode)
19. [Responsive Behaviour](#19-responsive-behaviour)

---

---

## 1. Design Tokens

### Surface colours

```css
/* Light mode */
--bg:      #F8F9FB;   /* page canvas */
--bg2:     #F0F2F6;   /* page canvas alt (zebra sections) */
--surf:    #FFFFFF;   /* cards, sidebar, topbar */
--surf2:   #F4F6FA;   /* table row hover, input bg, secondary surface */

/* Dark mode */
--bg:      #0B0E14;
--bg2:     #111520;
--surf:    #1C2333;
--surf2:   #232A3D;
```

### Text colours

```css
/* Light mode */
--text:    #0D1117;   /* primary — page titles, table values, bold labels */
--text2:   #4A5568;   /* secondary — descriptions, meta, nav labels */
--text3:   #8892A4;   /* tertiary — timestamps, placeholder, disabled */

/* Dark mode */
--text:    #E8EDF5;
--text2:   #8892A4;
--text3:   #4A5568;
```

### Border colours

```css
/* Light mode */
--border:  rgba(0,0,0,0.07);   /* default — all card borders, dividers */
--border2: rgba(0,0,0,0.12);   /* emphasis — focused inputs, hover */

/* Dark mode */
--border:  #1E2738;
--border2: #2A3450;
```

### Semantic colours

```css
/* Green — healthy / pass / clean / resolved / online */
--green:       #0F6E56;   /* light */  / #00C896;   /* dark */
--green-dim:   #E1F5EE;                / #00C89618;
--green-border:#9FE1CB;                / #00C89640;

/* Amber — warning / degraded / expiring / partial */
--amber:       #854F0B;                / #F5A623;
--amber-dim:   #FAEEDA;                / #F5A62318;
--amber-border:#FAC775;                / #F5A62340;

/* Red — critical / fail / listed / error / offline */
--red:         #A32D2D;                / #F55A5A;
--red-dim:     #FCEBEB;                / #F55A5A18;
--red-border:  #F09595;                / #F55A5A40;

/* Blue — informational / link / neutral metric */
--blue:        #185FA5;                / #4A9EFF;
--blue-dim:    #E6F1FB;                / #4A9EFF18;
--blue-border: #B5D4F4;                / #4A9EFF40;
--blue-mid:    #378ADD;                / #378ADD;
```

### ProxyOS accent (purple — replaces blue as primary action)

```css
/* ProxyOS-specific: purple accent replaces --blue for primary actions */
--accent:        #7C6FF0;   /* light */  / #9D8FFF;   /* dark */
--accent-dim:    #EEEDFE;                / #7C6FF018;
--accent-border: #AFA9EC;                / #7C6FF040;
--accent-dark:   #4338CA;                / #7C6FF0;   /* button bg */
--accent-hover:  #3730A3;                / #8A7DF5;
```

Note: all semantic colours (green/amber/red/blue) remain identical to MxWatch. Only `--accent` is purple instead of blue. The `--blue` token still exists for informational badges and neutral metrics.

### Shape & spacing

```css
--radius:    12px;   /* cards, containers, modals */
--radius-sm: 8px;    /* badges, small elements, inputs */

/* Buttons */
border-radius: 7px;  /* primary buttons */
border-radius: 8px;  /* ghost/secondary buttons */

/* Cards */
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 16px 18px;

/* Sidebar */
width: 220px;

/* Topbar */
height: 44px;

/* Content area */
padding: 20px 24px;
gap: 16px;
```

---

## 2. Typography

### Fonts

**IBM Plex Mono** (weights 400, 500, 600) — used for all technical values:
- Domain names and hostnames
- IP addresses and ports
- DNS records (SPF, DKIM, DMARC strings)
- Route upstream values
- Scores and numeric metrics
- Timestamps
- Badge counts
- Button labels
- Code blocks
- API keys, tokens, config values
- Version numbers

**Inter** (weights 300, 400, 500, 600) — used for all prose and UI chrome:
- Page titles
- Nav labels
- Card headers / section titles
- Description text
- Body copy
- Tooltip text
- Wizard prose

### Type scale

```css
/* Page titles */
font: 600 15px/1.4 'Inter', sans-serif;
color: var(--text);

/* Section / card headers */
font: 500 12px/1.4 'Inter', sans-serif;
color: var(--text2);
text-transform: uppercase;
letter-spacing: 0.06em;

/* Body / table values (prose) */
font: 400 13px/1.6 'Inter', sans-serif;
color: var(--text);

/* Technical values (mono) */
font: 400 12px/1.4 'IBM Plex Mono', monospace;
color: var(--text);

/* Secondary / meta */
font: 400 12px/1.4 'Inter', sans-serif;
color: var(--text2);

/* Timestamps */
font: 400 11px/1.4 'IBM Plex Mono', monospace;
color: var(--text3);

/* Nav items */
font: 400 13px/1.4 'Inter', sans-serif;
color: var(--text2);
/* active: */
font-weight: 500;
color: var(--text);

/* Stat card values (large numbers) */
font: 600 24px/1.2 'IBM Plex Mono', monospace;
color: var(--text);

/* Badges */
font: 500 11px/1 'IBM Plex Mono', monospace;
```

---

## 3. Logo & Brand

### Product name
**ProxyOS** — capital P, capital OS. Never "Proxy OS".

### Tagline
"Route · Secure · Observe"

### Logomark — Concept E (locked, do not change)

The ProxyOS mark is the key/proxy mark: a circle with inner ring on the left (source node), horizontal connector bar, branching via vertical stem into two rounded rectangles on the right (two destinations). Represents one source routing to two upstream targets.

**Icon background:** always `#7C6FF0` (purple-400). This is the one purple element that distinguishes ProxyOS from other OS family products that use the same MxWatch-derived UI.

### Canonical SVG (copy exactly everywhere)

```svg
<svg width="26" height="26" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="12" fill="#7C6FF0"/>
  <circle cx="18" cy="32" r="8" fill="#F0EFFE"/>
  <circle cx="18" cy="32" r="4" fill="#4338CA"/>
  <rect x="26" y="30" width="8" height="4" fill="#F0EFFE"/>
  <line x1="36" y1="32" x2="36" y2="44" stroke="#F0EFFE" stroke-width="3"/>
  <rect x="30" y="22" width="14" height="10" rx="3" fill="#F0EFFE"/>
  <rect x="30" y="40" width="14" height="10" rx="3" fill="#F0EFFE" opacity="0.65"/>
  <line x1="36" y1="27" x2="36" y2="32" stroke="#F0EFFE" stroke-width="3"/>
</svg>
```

### Wordmark

"ProxyOS" in Inter 500 14px, `var(--text)`. Always paired with mark.

### Version badge

`v2` or `v3` — IBM Plex Mono 10px, background `var(--surf2)`, colour `var(--text3)`, border-radius 4px, padding 1px 5px.

---

## 4. Layout Shell

**OS Family standard — all products use this shell identically. Only accent colour and logo mark differ.**

### Structure

```
┌────────────────────────────────────────────────┐
│  Chrome browser chrome (tab + address bar)     │
├──────────────┬─────────────────────────────────┤
│              │  Topbar (44px)                  │
│   Sidebar    ├─────────────────────────────────┤
│   (220px)    │                                 │
│              │  Content area                   │
│              │  padding: 20px 24px             │
│              │  gap: 16px                      │
│              │                                 │
│  [user area] │                                 │
└──────────────┴─────────────────────────────────┘
```

### Sidebar

```css
width: 220px;
background: var(--surf);
border-right: 1px solid var(--border);
display: flex;
flex-direction: column;
padding: 0;
```

**Logo row:**
```css
padding: 14px 16px 12px;
/* NO border-bottom — MxWatch standard: padding separation only, no divider line */
margin-bottom: 4px;
display: flex;
align-items: center;
gap: 9px;
```
Contents: mark (26×26) + product name (Inter 500 14px `var(--text)`) + version badge.

**Nav section labels:**
```css
font: 500 10px/1 'Inter', sans-serif;
text-transform: uppercase;
letter-spacing: 0.08em;
color: var(--text3);
padding: 14px 16px 5px;
```

**Nav items:**
```css
padding: 7px 16px;
font: 400 13px/1.4 'Inter', sans-serif;
color: var(--text2);
display: flex;
align-items: center;
gap: 9px;
border-radius: 0;
cursor: pointer;
transition: background 0.1s;
```
Hover: `background: var(--surf2); color: var(--text);`

Active:
```css
background: var(--accent-dim);
color: var(--accent-dark);
font-weight: 500;
/* NO border-right — MxWatch standard: background fill only, no side border */
```

**Nav icons:** 15×15px SVG, `color: var(--text3)`. Active: `color: var(--accent)`.

**Nav order:**
1. Dashboard
2. Routes
3. Analytics
4. Certificates
5. *(section: FEDERATION)*
6. Agents
7. Connections
8. Scanner
9. *(section: TOOLS)*
10. Import
11. Audit log

### Sidebar bottom — user area

**OS Family standard — no border, no separator line above this area. Floats at bottom with padding only.**

```css
margin-top: auto;
padding: 12px 14px;
display: flex;
align-items: center;
gap: 10px;
/* NO border-top — MxWatch standard: no line separating user area from nav */
```

**Avatar circle:**
```css
width: 32px;
height: 32px;
border-radius: 50%;
background: var(--accent-dim);
display: flex;
align-items: center;
justify-content: center;
font: 600 13px/1 'Inter', sans-serif;
color: var(--accent-dark);
flex-shrink: 0;
/* NO border, NO ring, NO outline — MxWatch standard */
```
Shows first initial of user's name.

**User info block:**
```css
flex: 1;
min-width: 0;
```
- Name: Inter 500 13px `var(--text)`, truncate with ellipsis
- Sub-line: Inter 400 11px `var(--text3)` — shows tier + version e.g. "self-hosted · v3"

**Three icon buttons (inline, top-right of user area):**
```css
display: flex;
gap: 2px;
align-items: center;
flex-shrink: 0;
```
Each button:
```css
width: 26px;
height: 26px;
border-radius: 6px;
border: none;
background: transparent;
color: var(--text3);
display: flex;
align-items: center;
justify-content: center;
cursor: pointer;
```
Hover: `background: var(--surf2); color: var(--text2)`.

Icons (left to right):
1. **Settings gear** — navigates to `/settings`
2. **Moon / Sun** — dark mode toggle (moon icon in light mode, sun icon in dark mode)
3. **Arrow-right-from-bracket** — logout / sign out

Icon size: 14×14px SVG.

The three icon buttons sit **above** the avatar+name row flush to the right, or **inline right-aligned** in the same row — follow MxWatch's exact layout which has them on the same row as the avatar, right-aligned.

### Topbar

```css
height: 44px;
padding: 0 20px;
background: var(--surf);
border-bottom: 1px solid var(--border);
display: flex;
align-items: center;
justify-content: space-between;
```

**Left — breadcrumb:**
```css
display: flex;
align-items: center;
gap: 6px;
font: 400 13px/1 'Inter', sans-serif;
color: var(--text2);
```
Format: `Dashboard / {Page Name}` — parent in `var(--text2)`, slash separator in `var(--text3)`, current page in Inter 500 `var(--text)`.

**Right — contextual actions:**
Varies per page. Always rightmost element. No user avatar in topbar — user info lives in sidebar bottom only.

Standard topbar right pattern:
```css
display: flex;
align-items: center;
gap: 10px;
```
Sync status dot + timestamp (IBM Plex Mono 11px `var(--text3)`) + action buttons.

### Content area

```css
background: var(--bg);
padding: 20px 24px;
display: flex;
flex-direction: column;
gap: 16px;
flex: 1;
overflow-y: auto;
```

### Page title + description block

Each page starts with a title+description block (no card wrapper — sits directly on `var(--bg)`):

```css
/* Title */
font: 600 22px/1.3 'Inter', sans-serif;
color: var(--text);
margin-bottom: 4px;

/* Description */
font: 400 13px/1.5 'Inter', sans-serif;
color: var(--text2);
margin-bottom: 16px;
```

Example: "Routes" / "All proxy routes managed by this ProxyOS instance."

---

## 5. Page: Dashboard

**Route:** `/`
**Topbar right:** Scanner (ghost btn), Import (ghost btn), + Expose service (primary btn)

### Stat cards — 4 column grid

```css
display: grid;
grid-template-columns: repeat(4, minmax(0, 1fr));
gap: 12px;
```

Each stat card:
```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 16px 18px;
```

Card anatomy:
- Label: Inter 500 11px uppercase letter-spacing, `var(--text3)`
- Value: IBM Plex Mono 600 24px, `var(--text)`
- Sub-line: Inter 400 12px, semantic colour

**4 cards:**
1. Active routes — value + "All upstreams healthy" (green) or "N down" (red)
2. Agents — "N / M online" + "1 offline" (amber) or "All online" (green)
3. Requests / 24h — IBM Plex Mono value + delta % vs yesterday
4. Certs expiring — count + "Within 14 days" (amber) or "None expiring" (green)

### Routes table card

Card with header row: "Routes" label (left) + "View all →" link (right, Inter 400 12px `var(--accent)`).

Table:
```css
width: 100%;
border-collapse: collapse;
table-layout: fixed;
font-family: 'Inter', sans-serif;
```

`th`:
```css
font: 500 11px/1 'Inter', sans-serif;
text-transform: uppercase;
letter-spacing: 0.05em;
color: var(--text3);
padding: 8px 14px;
border-bottom: 1px solid var(--border);
background: var(--surf2);
text-align: left;
```

`td`:
```css
padding: 10px 14px;
border-bottom: 1px solid var(--border);
font-size: 13px;
color: var(--text);
vertical-align: middle;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
```

Domain column: IBM Plex Mono 13px 500, `var(--text)`.
Upstream column: IBM Plex Mono 12px 400, `var(--text2)`.
Numbers (req/h): IBM Plex Mono 12px, `var(--text)`.
`tr:hover td`: `background: var(--surf2)`.
`tr:last-child td`: `border-bottom: none`.

**Column widths:**
| Column | Width |
|---|---|
| Domain | 26% |
| Upstream | 18% |
| Agent | 11% |
| TLS | 9% |
| SSO | 12% |
| Req/h | 9% |
| Status | 15% |

**Status cell:** dot (6×6px circle) + text. Green dot + "online", amber dot + "degraded", red dot + "down".

### Bottom two-column grid

```css
display: grid;
grid-template-columns: repeat(2, minmax(0, 1fr));
gap: 16px;
```

**Agents card** (left):
Each agent row: dot + name (Inter 500 13px) / meta line (Inter 400 11px `var(--text3)`) / status badge.
Border-bottom `1px solid var(--border)` between rows.

**Certificates card** (right):
Each cert row: domain (IBM Plex Mono 12px) + progress bar (72px × 3px) + days remaining (IBM Plex Mono 12px) + issuer (Inter 11px `var(--text3)`).
Progress bar colours: green (>30d), amber (8–30d), red (<8d).

---

## 6. Page: Routes

**Route:** `/routes`
**Topbar right:** agent filter dropdown, TLS filter, + Expose service

### Filter bar

```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 10px 14px;
display: flex;
gap: 10px;
align-items: center;
```

Contents: "All agents" select, "All TLS" select, "All SSO" select, domain search input (IBM Plex Mono 12px), route count right-aligned (IBM Plex Mono 12px `var(--text3)`).

### Full routes table

Same style as dashboard table. Additional columns: checkbox (leftmost), p95 latency (IBM Plex Mono 12px), last request (IBM Plex Mono 11px `var(--text3)`).

**Bulk action bar** (appears when rows selected):
```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 8px 14px;
display: flex;
align-items: center;
gap: 10px;
```
"N selected" (IBM Plex Mono 12px) + action buttons.

### Route detail side panel

Slides in from right, 400px wide, full height.
```css
background: var(--surf);
border-left: 1px solid var(--border);
```

Header: domain (IBM Plex Mono 500 14px) + status dot + close button.
Sections separated by `border-top: 1px solid var(--border)` with 16px padding each:
1. Upstream — IP:port (IBM Plex Mono), health status badge, last check (timestamp mono)
2. TLS — mode badge, cert expiry, issuer, renew button
3. SSO — toggle + provider badge + forward auth URL (IBM Plex Mono 11px)
4. Security (V3) — GeoIP config, Fail2ban status, mTLS toggle
5. Service chain — compact horizontal chain nodes (see Section 8 for chain spec)
6. Traffic 24h — sparkline (req/s)
7. Actions — Edit (ghost), Disable (ghost amber), Delete (ghost red)

---

## 7. Page: Analytics

**Route:** `/analytics`
**Topbar right:** time range picker (24h / 7d / 30d), route filter, Export CSV

### Summary stat row

6 stat cards in a row (narrower than dashboard cards):
Total requests, Error rate %, p50 latency, p95 latency, Bandwidth in, Bandwidth out.
All values: IBM Plex Mono 600 20px.

### Main chart

Full-width area in a card:
```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 16px 18px;
```
Two lines: total requests (accent colour), errors (red).
X axis: time labels (IBM Plex Mono 11px `var(--text3)`).
Y axis: request counts (IBM Plex Mono 11px `var(--text3)`).
Hover tooltip: `background: var(--surf2); border: 1px solid var(--border2); border-radius: var(--radius-sm); font: IBM Plex Mono 11px`.

### Per-route analytics table

Columns: Route (Plex Mono), Requests (Plex Mono), Error rate, p50, p95, Bandwidth, Trend sparkline.
Sortable. Same table styles as routes table.

---

## 8. Page: Certificates

**Route:** `/certificates`
**Topbar right:** + Add custom cert

### Status summary strip

```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 12px 18px;
display: flex;
gap: 24px;
align-items: center;
```
3 inline stats: N active (Inter 500 13px + IBM Plex Mono 600 20px value), N expiring (amber), N critical (red).

### Certificates table

Domain (IBM Plex Mono 500 13px), Issuer (Inter 400 12px `var(--text2)`), Mode (badge), Issued (IBM Plex Mono 11px), Expires (IBM Plex Mono 12px + days badge), Status (progress bar 80px + days), Agent (badge), Actions.

Row tints: amber-dim background for 8–30d rows, red-dim background for <8d rows.

### Internal CA panel

Collapsible section:
```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 14px 18px;
```
CA fingerprint: IBM Plex Mono 11px `var(--text3)`.
Expiry: IBM Plex Mono 12px.
Buttons: Download root cert (ghost), Regenerate CA (ghost red, requires confirm).

---

## 9. Page: Agents

**Route:** `/agents`
**Topbar right:** + Register agent

### Federation health banner

```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 16px 20px;
display: flex;
gap: 32px;
align-items: center;
```
N/M agents online (IBM Plex Mono 600 28px), total routes count, alert badges.

### Agents table

Name (Inter 500 13px + status dot), Site tag (badge), Connectivity (Inter 12px `var(--text2)`), Status (badge), Last seen (IBM Plex Mono 11px `var(--text3)`), Routes (IBM Plex Mono 12px), Caddy version (IBM Plex Mono 11px `var(--text3)`), Actions.

### Agent detail page (`/agents/[id]`)

Sub-tabs: Routes, Metrics, Health, Certificates, Logs, Settings.
Tab bar:
```css
border-bottom: 1px solid var(--border);
display: flex;
gap: 0;
```
Each tab: Inter 400 13px, `var(--text2)`. Active: Inter 500, `var(--text)`, `border-bottom: 2px solid var(--accent)`.

### Register agent wizard (`/agents/new`)

3-step flow. Step indicator: numbered circles (28×28px), connecting lines, Inter 12px labels.
Active step circle: `background: var(--accent-dark); color: #fff`.
Done step: `background: var(--green); color: #fff`.
Pending: `background: var(--surf2); border: 1px solid var(--border2); color: var(--text3)`.

Step 3 install snippet:
```css
background: var(--bg2);
border: 1px solid var(--border);
border-radius: var(--radius-sm);
padding: 12px 14px;
font: 400 12px/1.6 'IBM Plex Mono', monospace;
color: var(--text);
```

---

## 10. Page: Connections

**Route:** `/connections`
**Topbar right:** + Add connection

New in V3. Shows all configured external service connections.

### Connections grid

```css
display: grid;
grid-template-columns: repeat(3, minmax(0, 1fr));
gap: 12px;
```

Each connection card:
```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 16px 18px;
display: flex;
flex-direction: column;
gap: 10px;
```

Card contents:
- Top row: service icon (20×20 SVG) + service name (Inter 500 13px) + status badge
- Type label: Inter 400 11px `var(--text3)` (e.g. "DNS + Tunnel + WAF")
- Last sync: IBM Plex Mono 11px `var(--text3)`
- Bottom row: Sync now (ghost sm) + Settings (ghost sm)

### Connection type picker (`/connections/new`)

Grid of service type cards. Each card:
```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 20px;
cursor: pointer;
```
Hover: `border-color: var(--accent-border)`.
Selected: `border: 2px solid var(--accent); background: var(--accent-dim)`.

### Connection detail (`/connections/[id]`)

Two-column layout: config form (left 60%) + sync log table (right 40%).

Config form fields use standard input style (see Component Library section 16).

Sync log table:
Timestamp (IBM Plex Mono 11px), Result (badge), Duration (IBM Plex Mono 11px), Message (Inter 12px `var(--text2)`).

---

## 11. Page: Scanner

**Route:** `/scan`
**Topbar right:** agent selector, Scan now (primary), auto-watch toggle

### Scanner status strip

Same style as cert status strip. Last scan time (IBM Plex Mono 11px), N containers, N configured, N suggestions.

### Container list

Each container:
```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 14px 18px;
display: flex;
align-items: center;
gap: 14px;
margin-bottom: 8px;
```

Left: status icon (16×16).
Centre: container name (IBM Plex Mono 500 13px) + image tag (IBM Plex Mono 11px `var(--text3)`) / suggestion domain (Inter 12px accent) + strategy badge.
Right: action buttons.

**Status icons:**
- Green checkmark = already configured
- Accent dot = ready to expose (high confidence)
- Amber dot = needs review
- Grey dash = skipped

---

## 12. Page: Import

**Route:** `/import`
**Topbar right:** Import history link

### Step indicator

```css
display: flex;
align-items: center;
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 14px 20px;
gap: 0;
margin-bottom: 4px;
```

Step node: 24×24px circle. Done: green fill. Active: accent fill. Pending: `var(--surf2)` fill + `var(--border2)` stroke.
Step label: Inter 12px. Active: `var(--text)` 500. Done/pending: `var(--text3)`.
Connector line: 1px solid `var(--border2)`.

### Source picker (Step 1)

6-card grid (3×2), same style as connection type picker.
Fidelity badge per card: "High" (green), "Medium" (amber), "Perfect" (accent).

### Preview table (Step 3)

Same table style. Amber-dim row tint for "needs review" rows. Summary bar above table:
```css
background: var(--surf2);
border: 1px solid var(--border);
border-radius: var(--radius-sm);
padding: 8px 14px;
display: flex;
gap: 16px;
font: 400 12px 'Inter';
```
Counts: N detected, N ready (green), N review (amber), N configured (text3).

### Options (Step 4)

Two-column grid of option blocks:
```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius-sm);
padding: 12px 14px;
```
Label: Inter 500 11px uppercase `var(--text3)`.
Select: standard select style.

Toggle rows below (see toggle component).

---

## 13. Page: Audit Log

**Route:** `/audit`
**Topbar right:** Export CSV, action type filter

### Filter bar

Same style as routes filter bar.

### Log table

Timestamp (IBM Plex Mono 11px `var(--text3)`), Action (IBM Plex Mono 12px with coloured dot prefix), Subject (IBM Plex Mono 13px 500), Details (Inter 12px `var(--text2)`), Agent (badge), Result (badge).

Action dot colours:
- `route.created` → green
- `route.updated` → accent (purple)
- `route.deleted` → red
- `cert.renewed` → green
- `cert.expiring` → amber
- `agent.registered` → green
- `agent.offline` → amber
- `agent.token_revoked` → red
- `import.completed` → green

Expandable rows: click row → shows full diff payload in IBM Plex Mono 11px code block with `var(--bg2)` background.

---

## 14. Page: Settings

**Route:** `/settings`
**Layout:** vertical sub-nav (left 200px) + content area

### Sub-nav

Same style as sidebar nav items but inside the content area.
Active item: accent-dim background, accent text, accent border-left (2px).

### Settings sections

Each section:
```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 20px 22px;
display: flex;
flex-direction: column;
gap: 16px;
```

Section title: Inter 600 13px `var(--text)`.
Description: Inter 400 12px `var(--text2)`.
Field rows: label (Inter 500 12px `var(--text)`) + input, 24px vertical gap between rows.

**Sections:** General, Alerts, SSO Providers, DNS Providers, Infra OS Integration, Export, Danger zone.

### Danger zone section

```css
border-color: var(--red-border);
background: var(--red-dim);
```
Title: Inter 600 13px `var(--red)`.
Buttons: ghost red style.
Destructive actions require typing confirmation string in IBM Plex Mono input before enabling.

---

## 15. Wizard: Expose Service (V3)

**Trigger:** "+ Expose service" from topbar
**Presentation:** full-page overlay slides from right, sidebar remains visible

### Step indicator

7 steps for V3 full chain wizard:
1. Source
2. Domain + DNS
3. Routing path
4. Access
5. Options
6. Monitoring
7. Review

Same step indicator style as Import wizard.

### Wizard shell

```css
background: var(--bg);
```

Header bar:
```css
background: var(--surf);
border-bottom: 1px solid var(--border);
padding: 14px 20px;
display: flex;
align-items: center;
justify-content: space-between;
```
Title: "Expose service" (Inter 600 15px) + step indicator + Cancel button.

Content:
```css
padding: 24px;
max-width: 680px;
margin: 0 auto;
display: flex;
flex-direction: column;
gap: 20px;
```

Footer:
```css
background: var(--surf);
border-top: 1px solid var(--border);
padding: 14px 20px;
display: flex;
align-items: center;
justify-content: space-between;
```
Left: Back (ghost). Right: Continue / Expose (primary).

### Step sections

Each step section:
```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 18px 20px;
```
Section label: Inter 500 11px uppercase `var(--text3)`.

**Step 2 — DNS auto-create preview:**
```
CNAME n8n.homelabza.com → abc123.cfargotunnel.com
```
IBM Plex Mono 12px in `var(--bg2)` block with `var(--border)` border and `var(--radius-sm)` radius.

**Step 7 — Review chain preview:**
Each action row:
```css
display: flex;
align-items: center;
gap: 12px;
padding: 8px 0;
border-bottom: 1px solid var(--border);
```
Service label: IBM Plex Mono 500 12px `var(--text3)` (fixed 100px width).
Action: IBM Plex Mono 400 12px `var(--text)`.
Status icon: pending (grey circle), success (green check), error (red x).

**Post-expose chain formation:** same row style with animated status icons updating in real-time.

---

## 16. Component Library

### Badge

```css
display: inline-flex;
align-items: center;
gap: 4px;
font: 500 11px/1 'IBM Plex Mono', monospace;
padding: 3px 7px;
border-radius: var(--radius-sm);
white-space: nowrap;
```

Variants:
```css
/* green */
background: var(--green-dim);
color: var(--green);
border: 1px solid var(--green-border);

/* amber */
background: var(--amber-dim);
color: var(--amber);
border: 1px solid var(--amber-border);

/* red */
background: var(--red-dim);
color: var(--red);
border: 1px solid var(--red-border);

/* blue (informational) */
background: var(--blue-dim);
color: var(--blue);
border: 1px solid var(--blue-border);

/* accent/purple (ProxyOS-specific: SSO provider, agent badges) */
background: var(--accent-dim);
color: var(--accent-dark);
border: 1px solid var(--accent-border);

/* neutral */
background: var(--surf2);
color: var(--text2);
border: 1px solid var(--border2);
```

### Status dot

```css
width: 7px;
height: 7px;
border-radius: 50%;
display: inline-block;
flex-shrink: 0;
```
Green: `var(--green)`. Amber: `var(--amber)`. Red: `var(--red)`. Grey: `var(--text3)`.

### Buttons

**Primary:**
```css
background: var(--accent-dark);
color: #FFFFFF;
border: none;
padding: 7px 16px;
border-radius: 7px;
font: 500 13px/1 'IBM Plex Mono', monospace;
cursor: pointer;
```
Hover: `background: var(--accent-hover)`.

**Ghost:**
```css
background: transparent;
color: var(--text);
border: 1px solid var(--border2);
padding: 7px 16px;
border-radius: 8px;
font: 400 13px/1 'IBM Plex Mono', monospace;
cursor: pointer;
```
Hover: `background: var(--surf2)`.

**Ghost small:**
Same but `padding: 5px 10px; font-size: 12px`.

**Ghost red (destructive):**
```css
border-color: var(--red-border);
color: var(--red);
```
Hover: `background: var(--red-dim)`.

**Ghost amber:**
```css
border-color: var(--amber-border);
color: var(--amber);
```

### Input fields

```css
background: var(--surf2);
border: 1px solid var(--border);
border-radius: var(--radius-sm);
padding: 8px 11px;
font: 400 13px/1.4 'IBM Plex Mono', monospace;
color: var(--text);
width: 100%;
```
Placeholder: `var(--text3)`.
Focus: `border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px var(--accent-dim)`.

### Select

Same style as input. Custom dropdown arrow SVG in `var(--text3)`.

### Toggle

```css
width: 34px;
height: 20px;
border-radius: 10px;
cursor: pointer;
position: relative;
transition: background 0.15s;
flex-shrink: 0;
```
OFF: `background: var(--surf2); border: 1px solid var(--border2)`.
ON: `background: var(--accent-dark); border: none`.

Knob:
```css
position: absolute;
top: 2px;
width: 16px; height: 16px;
border-radius: 50%;
background: #fff;
transition: transform 0.15s;
```
OFF: `left: 2px`. ON: `transform: translateX(14px)`.

### Checkbox

```css
width: 15px; height: 15px;
border-radius: 4px;
border: 1px solid var(--border2);
background: var(--surf2);
cursor: pointer;
position: relative;
```
Checked: `background: var(--accent-dark); border-color: var(--accent-dark)`. White checkmark SVG inside.

### Card

```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
overflow: hidden;
```

Card header:
```css
padding: 10px 14px;
border-bottom: 1px solid var(--border);
background: var(--surf2);
display: flex;
align-items: center;
justify-content: space-between;
```
Title: Inter 500 11px uppercase letter-spacing `var(--text3)`.
Action link: Inter 400 12px `var(--accent)`.

Card body: `padding: 0` (table fills edge-to-edge) OR `padding: 14px 18px` (for content cards).

### Progress bar

```css
height: 3px;
border-radius: 2px;
background: var(--surf2);
overflow: hidden;
```
Fill: `border-radius: 2px`. Colours: green / amber / red based on value.

### Stat card

```css
background: var(--surf);
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 16px 18px;
```
Label: Inter 500 11px uppercase letter-spacing `var(--text3)`. Margin-bottom 8px.
Value: IBM Plex Mono 600 24px `var(--text)`.
Sub: Inter 400 12px semantic colour. Margin-top 4px.

### Alert banner

Full-width, sits below topbar when active:
```css
padding: 10px 20px;
display: flex;
align-items: center;
justify-content: space-between;
font: 400 13px/1.4 'Inter', sans-serif;
```
Red variant: `background: var(--red-dim); border-bottom: 1px solid var(--red-border); color: var(--red)`.
Amber variant: `background: var(--amber-dim); border-bottom: 1px solid var(--amber-border); color: var(--amber)`.
Dismiss: ✕ button, ghost sm style.

### Code block

```css
background: var(--bg2);
border: 1px solid var(--border);
border-radius: var(--radius-sm);
padding: 12px 14px;
font: 400 12px/1.6 'IBM Plex Mono', monospace;
color: var(--text);
overflow-x: auto;
```

### Tooltip

```css
background: var(--surf);
border: 1px solid var(--border2);
border-radius: var(--radius-sm);
padding: 6px 10px;
font: 400 11px/1.4 'IBM Plex Mono', monospace;
color: var(--text2);
box-shadow: 0 4px 12px rgba(0,0,0,0.15);
pointer-events: none;
z-index: 100;
```

### Service chain nodes (V3)

Horizontal row of nodes for route detail panel:

```css
display: flex;
align-items: center;
gap: 0;
overflow-x: auto;
padding: 10px 0;
```

Each node:
```css
display: flex;
flex-direction: column;
align-items: center;
gap: 4px;
min-width: 64px;
padding: 0 4px;
```
Icon: 20×20 service SVG or letter mark, `var(--surf2)` background circle.
Status dot: 6px, positioned top-right of icon.
Label: IBM Plex Mono 10px `var(--text3)`.

Connector between nodes:
```css
height: 1px;
flex: 1;
min-width: 16px;
background: var(--border2);
margin-top: -18px; /* align with icon center */
```
Connector coloured by worst status in chain.

---

## 17. Browser Identity

### Favicon

SVG data URI at 16×16 and 32×32. At small sizes the mark simplifies: outer rect + filled source circle (no inner ring) + connector + two destination rects.

```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,...">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
```

### Page title format

```
ProxyOS — {Page Name}
```

Examples: `ProxyOS — Dashboard`, `ProxyOS — Routes`, `ProxyOS — n8n.homelabza.com`

### Chrome tab

Tab favicon: 14×14 logomark. Tab title: `ProxyOS — {Page}`.
Address bar: 12×12 mark + domain URL.

---

## 18. Dark/Light Mode

### Implementation

Toggle adds/removes `.dark` class on `<html>` element — same pattern as MxWatch.

```js
// /public/theme-init.js — runs before React hydrates, prevents flash
(function() {
  const t = localStorage.getItem('proxyos-theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();
```

All colours via CSS variables, all variables defined in two blocks:
```css
:root { /* light values */ }
.dark { /* dark values */ }
```

### Default theme

Dark mode is the default for ProxyOS (infrastructure tool, operator audience). Light mode available via toggle in Settings → General, persisted in `localStorage.proxyos-theme`.

### Theme toggle location

Settings → General section → "Appearance" row. Also accessible via keyboard shortcut `Cmd/Ctrl + Shift + L`.

Toggle shows sun icon (light) / moon icon (dark). No system auto option — explicit user choice.

---

## 19. Responsive Behaviour

ProxyOS is desktop-first. Minimum supported viewport: 1024px.

### Breakpoints

| Width | Behaviour |
|---|---|
| ≥ 1280px | Full layout |
| 1024–1279px | Sidebar icon-only (44px wide), nav tooltips on hover, wordmark hidden |
| < 1024px | "Open on desktop" splash — Inter 400 14px `var(--text2)` centred on `var(--bg)` |

### Collapsed sidebar (1024–1279px)

```css
width: 44px;
```
Logo: mark only (26×26), centred.
Nav items: icon only, centred. Hover: tooltip (right side) showing label — same tooltip component style.
Section labels: hidden.
Bottom settings: icon only.

### Tables on smaller viewports

Tables within 1024–1279px: hide lower-priority columns (p95 latency, last request, agent column if viewing agent-filtered page). Core columns always visible: domain, upstream, status.

---

## Appendix: OS Family Colour Quick Reference

When building any new OS family product, only change `--accent`, `--accent-dim`, `--accent-border`, `--accent-dark`, `--accent-hover`, and the logo mark colour. Everything else from this spec carries over unchanged.

| Product | Accent light | Accent dark | Mark bg |
|---|---|---|---|
| MxWatch | `#185FA5` | `#4A9EFF` | `#185FA5` |
| ProxyOS | `#7C6FF0` | `#9D8FFF` | `#7C6FF0` |
| BackupOS | `#854F0B` | `#F5A623` | `#854F0B` |
| InfraOS | `#0F6E56` | `#00C896` | `#0F6E56` |
| LockBoxOS | `#534AB7` | `#9D93F5` | `#534AB7` |
| PatchOS | `#A32D2D` | `#F55A5A` | `#A32D2D` |
| AccessOS | `#0F6E6E` | `#00C8C8` | `#0F6E6E` |

Surface, text, border, semantic (green/amber/red/blue), fonts, spacing, radius, and component structure: **identical across all products**.

---

*ProxyOS UI/UX Design Spec v3.0 — proxyos.app — Homelab OS Family Standard — April 2026*
