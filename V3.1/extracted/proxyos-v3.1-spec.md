# ProxyOS — V3.1 Feature Spec
## UX Improvements: Host Management · Certificates · Access Lists

**Version:** 3.1  
**Date:** April 2026  
**Status:** Pre-implementation spec  
**Builds on:** V3.0 (ProxyOS Connect, service chain, security layer)  
**Version badge in UI:** `v3.1`

---

## The V3.1 Thesis

V3.0 made ProxyOS own the whole chain.  
V3.1 makes it **easier to use than NPM** for every common task.

The gap right now: exposing a service or managing a certificate requires too much prior knowledge. Users need to know what DNS-01 is before they can get a wildcard cert. They need to know what port 80 does before they understand why their cert failed. They need to figure out IP rules and basic auth separately with no guidance.

V3.1 closes that gap — better host types, guided certificate workflows, pre-flight checks that catch failures before they happen, and an access list system that's actually coherent.

---

## Table of Contents

1. [Version bump — UI and sidebar](#1-version-bump--ui-and-sidebar)
2. [Redirect hosts](#2-redirect-hosts)
3. [Streams (TCP/UDP passthrough)](#3-streams-tcpudp-passthrough)
4. [Dead / error hosts](#4-dead--error-hosts)
5. [Certificate improvements](#5-certificate-improvements)
6. [Wildcard certificate UI](#6-wildcard-certificate-ui)
7. [Certificate helper wizard](#7-certificate-helper-wizard)
8. [Certificate editing](#8-certificate-editing)
9. [Route & certificate operation logs](#9-route--certificate-operation-logs)
10. [Access lists — full redesign](#10-access-lists--full-redesign)
11. [Pre-flight checks](#11-pre-flight-checks)
12. [HTTP → HTTPS global redirect](#12-http--https-global-redirect)
13. [Let's Encrypt rate limit indicator](#13-lets-encrypt-rate-limit-indicator)
14. [Navigation changes](#14-navigation-changes)
15. [Database schema additions](#15-database-schema-additions)
16. [API surface additions](#16-api-surface-additions)
17. [Build order](#17-build-order)

---

---

## 1. Version bump — UI and sidebar

### Version badge

The version badge in the sidebar logo row updates from `v3` to `v3.1`.

```
Location: sidebar logo row, right of "ProxyOS" wordmark
Value:     v3.1
Style:     IBM Plex Mono 10px, background var(--surf2), colour var(--text3),
           border-radius 4px, padding 1px 5px
```

### Sub-line

The user area sub-line updates from `self-hosted · v3` to `self-hosted · v3.1` for self-hosted instances. Cloud instances show `cloud solo · v3.1` or `cloud teams · v3.1`.

### App version source

The version string is a single constant in the codebase, referenced everywhere it appears:

```typescript
// packages/types/src/version.ts
export const PROXYOS_VERSION = '3.1.0'
export const PROXYOS_VERSION_DISPLAY = 'v3.1'
```

Sidebar sub-line, page `<title>`, API responses, and the `/api/health` endpoint all read from this constant. Bump the constant in one place, updated everywhere.

### Page title

```
ProxyOS v3.1 — Dashboard
ProxyOS v3.1 — Routes
```

---

---

## 2. Redirect Hosts

A **Redirect Host** is a domain that sends the visitor to another URL. No upstream service. No port. Just a domain → destination mapping.

### When users need this

- Redirecting a legacy domain to a new one (`oldsite.com` → `newsite.com`)
- Forcing `www` to apex or apex to `www`
- Redirecting deprecated paths to new locations
- Parking a domain temporarily while a site is being built

### UI — Create redirect host

Separate entry point from "Expose service" — new button in the routes page topbar: **+ Redirect host**.

```
Step 1 — Source domain
  Domain input (e.g. old.homelabza.com)
  TLS toggle: "Issue a certificate for this domain" (default ON, recommended)
  Explanation: "Even redirect domains need a certificate — otherwise visitors
  on HTTPS will see a security warning before being redirected."

Step 2 — Destination
  Destination URL input (e.g. https://new.homelabza.com)
  Redirect type:
    ○ 301 Permanent  — "Use this when the redirect is forever.
                        Search engines will transfer SEO value to the new URL."
    ○ 302 Temporary  — "Use this when you might change the destination later.
                        Search engines keep the original URL indexed."

  Preserve path  [toggle]
    OFF: old.homelabza.com/any/path → https://new.homelabza.com
    ON:  old.homelabza.com/blog/post → https://new.homelabza.com/blog/post
    Explanation shown inline.

  Preserve query string  [toggle]
    OFF: old.homelabza.com?ref=email → https://new.homelabza.com
    ON:  old.homelabza.com?ref=email → https://new.homelabza.com?ref=email

Step 3 — Review + create
  Shows the redirect rule in plain English:
  "When someone visits old.homelabza.com, they will be permanently redirected
   to https://new.homelabza.com, preserving the URL path."
```

### Caddy implementation

```json
{
  "match": [{ "host": ["old.homelabza.com"] }],
  "handle": [{
    "handler": "static_response",
    "status_code": 301,
    "headers": {
      "Location": ["https://new.homelabza.com{http.request.uri}"]
    }
  }],
  "terminal": true
}
```

Path preservation: use `{http.request.uri}` (includes path + query).
No path preservation: use `https://new.homelabza.com`.
Query string only: use `{http.request.uri.path}` to preserve path without query.

### Redirect host in routes table

Redirect hosts appear in the main routes table with a distinct badge:

```
Domain              Destination                  Type    Status
old.homelabza.com → https://new.homelabza.com   301 ↗   ● active
```

---

---

## 3. Streams (TCP/UDP Passthrough)

A **Stream** forwards raw TCP or UDP traffic to an upstream service without HTTP processing. Used for non-HTTP services: databases, game servers, mail servers, VNC, custom protocols.

### Important build note

Caddy's layer4 module is a separate plugin — it is NOT included in the standard Caddy binary. The ProxyOS Docker image must be built with a custom Caddy binary that includes `github.com/mholt/caddy-l4`. The Dockerfile builds Caddy from source using `xcaddy`:

```dockerfile
FROM caddy:builder AS caddy-builder
RUN xcaddy build \
    --with github.com/mholt/caddy-l4
```

### UI — Create stream

New entry point: **+ Stream** button in routes page topbar.

```
Step 1 — Source port
  Port input (numeric, 1–65535)
  Protocol:
    ○ TCP    — "Most services: databases, mail servers, game servers"
    ○ UDP    — "DNS, VPN (WireGuard), some game servers, media streaming"
    ○ TCP + UDP — "Both protocols on the same port"

  Info banner:
  "Streams route raw network traffic — not websites. If you're trying to
   expose a web application or API, use 'Expose service' instead."

Step 2 — Upstream
  IP:port input
  Pre-flight check: probe upstream immediately on input

Step 3 — Review + create
  Plain English summary:
  "TCP traffic arriving on port 25565 will be forwarded to
   192.168.69.30:25565 (Minecraft server)"
```

### Stream in routes table

```
Port        Upstream                Protocol  Status
:25565  →   192.168.69.30:25565    TCP       ● active
:1194   →   192.168.69.1:1194      UDP       ● active
```

Streams are shown in a separate **Streams** section below the proxy routes table, or filterable via the type filter in the routes page.

### Caddy layer4 config

```json
{
  "apps": {
    "layer4": {
      "servers": {
        "stream_25565": {
          "listen": [":25565"],
          "routes": [{
            "handle": [{
              "handler": "proxy",
              "upstreams": [{ "dial": "192.168.69.30:25565" }]
            }]
          }]
        }
      }
    }
  }
}
```

---

---

## 4. Dead / Error Hosts

A **Dead host** (better name in ProxyOS UI: **Error host**) configures a domain to return a specific HTTP error response — optionally with a custom page. Used for retired domains, maintenance pages, placeholder pages.

### UI — Create error host

New entry point: **+ Error host** in routes page topbar.

```
Step 1 — Domain
  Domain input
  TLS toggle (default ON — even error pages should be served over HTTPS)

Step 2 — Response
  Status code:
    ○ 404 Not Found        — "The domain exists but there's nothing here"
    ○ 410 Gone             — "This content has been permanently removed
                              (better for SEO than 404 on retired content)"
    ○ 503 Service Unavailable — "Temporarily down for maintenance"
    ○ Custom               — numeric input (any valid HTTP status code)

  Page content:
    ○ Default ProxyOS error page  — clean, branded
    ○ Custom HTML                 — textarea (paste your HTML)
    ○ Redirect to URL             — sends to a maintenance/coming-soon page
                                    (uses the redirect host logic)

Step 3 — Review + create
```

### Error host in routes table

```
Domain                 Response    Status
retired.homelabza.com  410 Gone    ● active
staging.homelabza.com  503         ● active (maintenance mode)
```

---

---

## 5. Certificate Improvements

### 5.1 Certificate type UI — clear explanations

Each certificate type gets a proper explanation card in the UI. Currently they're just radio options with labels. In V3.1 each option expands to show:

**HTTP-01 (Let's Encrypt / ZeroSSL)**
```
Best for: public domains with port 80 accessible from the internet
How it works: Let's Encrypt places a file at /.well-known/acme-challenge/
              on your server and verifies it can be fetched publicly.
Requirements: ✓ Domain must point to this server
              ✓ Port 80 must be reachable from the internet
              ✗ Cannot issue wildcard certificates (*.yourdomain.com)

[Run pre-flight check]  ← checks DNS + port 80 reachability before attempting
```

**DNS-01 (via Cloudflare, Route53, Hetzner DNS)**
```
Best for: private/internal domains, wildcard certificates,
          servers where port 80 is blocked
How it works: ProxyOS creates a temporary TXT record in your DNS to prove
              domain ownership. No port 80 needed.
Requirements: ✓ DNS provider must be configured in Connections
              ✓ API token must have DNS edit permissions
              ✓ Required for *.yourdomain.com wildcard certificates

DNS provider: [Cloudflare — homelabza.com ✓]  ← shows connected provider
              [+ Connect DNS provider]         ← if none configured
```

**Internal CA (Caddy internal)**
```
Best for: LAN-only services, internal tools, services with no public DNS
How it works: ProxyOS generates its own certificate authority and issues
              certificates signed by it. Browsers will show a warning
              until you install the root CA certificate.
Requirements: ✓ No public DNS needed
              ✓ No port 80 needed

[Download root CA certificate]  ← one click
[Trust instructions]            ← see Section 5.2
```

**Custom certificate**
```
Best for: certificates already issued by a third party,
          certificates from your own PKI
Upload: [Choose certificate file (.crt, .pem)]
        [Choose private key file (.key, .pem)]
        [Choose CA chain file (optional)]

After upload: shows expiry date, issuer, SANs, and warns if:
  - Key does not match certificate
  - Chain is incomplete
  - Certificate is already expired
  - Certificate expires within 30 days
```

### 5.2 Internal CA — trust instructions

A dedicated "Trust this CA" modal, accessible from:
- The cert type picker when Internal CA is selected
- The Certificates page header when any internal CA cert exists
- The cert detail view

The modal shows platform-specific step-by-step instructions. User selects their platform from tabs:

**Chrome / Firefox (all platforms)**
```
1. Click "Download root CA" below
2. Open Chrome → Settings → Privacy and security → Security
3. Scroll to "Manage certificates" → Authorities tab
4. Click "Import" and select the downloaded file
5. Check "Trust this certificate for identifying websites"
6. Click OK — refresh any pages using internal CA certificates
```

**macOS**
```
1. Click "Download root CA" below
2. Double-click the downloaded file — Keychain Access opens
3. Drag the certificate to "System" keychain
4. Double-click the certificate in Keychain Access
5. Expand "Trust" → set "When using this certificate" to "Always Trust"
6. Close and enter your password when prompted
```

**Windows**
```
1. Click "Download root CA" below
2. Double-click the downloaded file
3. Click "Install Certificate"
4. Select "Local Machine" → Next
5. Select "Place all certificates in the following store"
6. Click Browse → select "Trusted Root Certification Authorities"
7. Click Next → Finish → Yes to the security prompt
```

**iOS**
```
1. Click "Download root CA" below — opens in Safari
2. Tap "Allow" when prompted to download a configuration profile
3. Go to Settings → General → VPN & Device Management
4. Tap the downloaded profile → Install → enter your passcode
5. Go to Settings → General → About → Certificate Trust Settings
6. Enable full trust for the ProxyOS root CA
```

**Android**
```
1. Click "Download root CA" below
2. Open Settings → Security → Encryption & credentials
3. Tap "Install a certificate" → CA certificate
4. Select the downloaded file
Note: Android 11+ requires a user or work profile. Some browsers
(Chrome) do not trust user-installed CAs — use Firefox instead.
```

**curl / API clients**
```bash
# Download the root CA certificate first, then:
curl --cacert proxyos-root-ca.pem https://internal.yourdomain.com

# Or set permanently in your environment:
export CURL_CA_BUNDLE=/path/to/proxyos-root-ca.pem

# For Node.js:
export NODE_EXTRA_CA_CERTS=/path/to/proxyos-root-ca.pem
```

Download button always visible at the bottom of each tab.

---

---

## 6. Wildcard Certificate UI

Wildcard certificates get their own dedicated section in the Certificates page — they're complex enough to deserve it.

### What users need to know (shown in UI)

```
┌─────────────────────────────────────────────────────────────┐
│  Wildcard certificates — *.yourdomain.com                    │
│                                                              │
│  A wildcard certificate covers any single subdomain:         │
│  ✓ app.yourdomain.com                                        │
│  ✓ api.yourdomain.com                                        │
│  ✓ mail.yourdomain.com                                       │
│  ✗ api.staging.yourdomain.com  (two levels deep — not covered)│
│                                                              │
│  Wildcards always require DNS-01 — they cannot be issued     │
│  using the standard HTTP challenge.                          │
│                                                              │
│  DNS provider: Cloudflare ✓                                  │
│                                                              │
│  [Issue wildcard certificate]                                │
└─────────────────────────────────────────────────────────────┘
```

### Issue wildcard certificate form

```
Domain: *.yourdomain.com
Also cover apex domain (yourdomain.com)? [toggle — default ON]
  Explanation: "Without this, yourdomain.com itself is not covered
                by the wildcard — only subdomains are."

DNS provider: Cloudflare (homelabza.com)  [change]

Subject Alternative Names (SANs) this cert will cover:
  *.yourdomain.com
  yourdomain.com  (if apex toggle is ON)

Routes currently using this wildcard once issued:
  (none yet — will auto-assign when routes match *.yourdomain.com)

[Issue certificate]
```

### Wildcard cert in certificates table

```
Domain              Type      Expiry    Routes using it    Status
*.homelabza.com     wildcard  82 days   6 routes           ● active
homelabza.com       auto      82 days   1 route            ● active  (shared cert)
```

Clicking a wildcard cert shows the full list of routes using it, their domains, and whether each is currently serving the wildcard cert.

---

---

## 7. Certificate Helper Wizard

A standalone "Get a certificate" tool — independent of the expose wizard. Accessible from the Certificates page → **+ Get certificate**.

Use case: issuing a cert for a service that isn't behind ProxyOS (mail server, NAS, appliance, API) or just wanting to download a cert for use elsewhere.

### Steps

**Step 1 — Domains**
```
Primary domain: [input]
Additional domains (SANs): [+ Add domain]
  (add as many as needed — multi-SAN cert)

Wildcard: [toggle]
  If ON: prepends *. to the primary domain automatically
         and explains DNS-01 is required
```

**Step 2 — Method**
```
○ HTTP-01 (Let's Encrypt)
  [Pre-flight check: is port 80 reachable?]  → runs immediately

○ DNS-01 (Cloudflare / Route53 / Hetzner DNS)
  Provider: [dropdown of connected providers]
  [No provider configured? → Add one in Connections]

○ Internal CA
  [No internet required — certificate issued immediately]
```

**Step 3 — Issue**

Live log stream (see Section 9) showing every step of the issuance process. Progress bar. On completion:

**Step 4 — Download**
```
Certificate issued for api.homelabza.com
Expires: 2026-07-16 (89 days)
Issuer: Let's Encrypt

Download formats:
  [PEM — certificate only]
  [PEM — certificate + chain]
  [PEM — private key]
  [PKCS12 (.p12) — cert + key + chain bundled]
  [DER — binary format (Java, some appliances)]

Copy to clipboard: [certificate PEM]  [private key PEM]
```

The cert is also stored in ProxyOS's certificate store and available in the Certificates page for future management.

---

---

## 8. Certificate Editing

Currently certificates are created and then mostly untouchable. V3.1 adds a full edit flow.

### Cert detail page (`/certificates/[id]`)

Accessible by clicking any cert in the Certificates table.

**Header:**
Domain, issuer badge, expiry badge, status badge, [Force renew] button, [Edit] button.

**Details tab:**
```
Subject:          app.homelabza.com
Subject Alt Names: app.homelabza.com, api.homelabza.com
Issuer:           Let's Encrypt (R11)
Serial number:    03:a1:4f:... (IBM Plex Mono)
Valid from:       2026-04-16
Valid until:      2026-07-15  (89 days remaining)
Key algorithm:    ECDSA P-256
Signature:        SHA256WithECDSA
OCSP stapling:    ✓ enabled
CT log:           ✓ included
```

**Certificate chain viewer:**
Expandable tree:
```
▼ End certificate — app.homelabza.com
    ▼ Intermediate — Let's Encrypt R11
        Root — ISRG Root X1
```

**Edit domains:**
Allows adding or removing SANs without deleting and recreating:

```
Current domains covered by this certificate:
  app.homelabza.com   [✕ remove]
  api.homelabza.com   [✕ remove]

[+ Add domain]

Note: editing domains will reissue the certificate.
A new certificate will be requested and the old one
will be replaced once issuance succeeds.
```

**Change method:**
Switch from HTTP-01 to DNS-01 (or vice versa) without recreating:

```
Current method: HTTP-01 (Let's Encrypt)
[Switch to DNS-01]   [Switch to ZeroSSL]
```

**Routes using this certificate:**
```
app.homelabza.com   (route: app → 192.168.69.10:3000)
api.homelabza.com   (route: api → 192.168.69.10:8080)
```

---

---

## 9. Route & Certificate Operation Logs

### Operations log — what it is

A persistent, timestamped, human-readable log of every significant operation ProxyOS performs. Not a debug log — a clear narrative of what happened and whether it succeeded.

### Log entry types

```typescript
type OperationLogEntry = {
  id: string
  timestamp: number
  type: 'route_create' | 'route_update' | 'route_delete'
       | 'cert_issue' | 'cert_renew' | 'cert_edit' | 'cert_delete'
       | 'dns_create' | 'dns_update' | 'dns_delete'
       | 'agent_push' | 'access_list_update'
  subject: string        // e.g. "app.homelabza.com"
  status: 'in_progress' | 'success' | 'error'
  steps: OperationStep[]
  duration_ms?: number
  error?: string
}

type OperationStep = {
  timestamp: number
  message: string        // human-readable plain English
  status: 'info' | 'success' | 'error' | 'warning'
}
```

### Example operation log entries

**HTTP-01 cert issuance — success:**
```
14:23:01  info     Starting HTTP-01 challenge for app.homelabza.com
14:23:01  info     Requesting challenge token from Let's Encrypt
14:23:02  info     Serving challenge at /.well-known/acme-challenge/xK9f...
14:23:04  success  Let's Encrypt verified challenge
14:23:04  info     Requesting certificate...
14:23:06  success  Certificate issued — expires 2026-07-15
14:23:06  success  Certificate active
                   ─────────────────────────
                   Completed in 5.2s
```

**DNS-01 cert issuance — wildcard:**
```
14:23:01  info     Starting DNS-01 challenge for *.homelabza.com
14:23:01  info     Creating TXT record _acme-challenge.homelabza.com via Cloudflare
14:23:02  success  TXT record created (value: "Bs9k2f...")
14:23:02  info     Waiting for DNS propagation...
14:23:08  info     Checking propagation via 1.1.1.1... not yet
14:23:18  info     Checking propagation via 1.1.1.1... not yet
14:23:28  info     Checking propagation via 1.1.1.1... not yet
14:23:38  success  DNS propagation confirmed (1.1.1.1 + 8.8.8.8)
14:23:38  info     Notifying Let's Encrypt to verify...
14:23:41  success  Let's Encrypt verified DNS challenge
14:23:41  info     Requesting certificate for *.homelabza.com + homelabza.com...
14:23:43  success  Certificate issued — expires 2026-07-15
14:23:43  info     Removing TXT record _acme-challenge.homelabza.com...
14:23:44  success  TXT record removed
14:23:44  success  Certificate active
                   ─────────────────────────
                   Completed in 43.1s
```

**Route creation:**
```
14:20:01  info     Building Caddy route config for n8n.homelabza.com
14:20:01  info     SSO: forward_auth → Authentik (auth.homelabza.com)
14:20:01  info     Rate limit: 100 req/min
14:20:01  info     Sending to Caddy Admin API (POST /config/apps/http/servers/main/routes)
14:20:01  success  Route active (47ms)
14:20:01  info     Starting certificate provisioning...
14:20:01  info     → See certificate operation log
```

**HTTP-01 failure — informative:**
```
14:15:01  info     Starting HTTP-01 challenge for app.homelabza.com
14:15:01  info     Requesting challenge token from Let's Encrypt
14:15:02  info     Serving challenge at /.well-known/acme-challenge/xK9f...
14:15:32  error    Let's Encrypt could not verify challenge
14:15:32  error    Error: "Connection refused" — port 80 is not reachable
                   ─────────────────────────
                   Failed after 31.2s

          Suggested fix:
          • Check that port 80 is open on your firewall/router
          • Check that app.homelabza.com resolves to this server's IP
          • Run the DNS pre-flight check to verify
          • Consider switching to DNS-01 if port 80 is blocked
```

### Where logs appear

**Inline — in wizard/helper (live):**
The expose wizard Step 7 (review) transitions to a live log view after clicking "Expose". The cert helper wizard Step 3 shows the cert issuance log live. Both stream over WebSocket.

**Persistent — /logs/operations:**
New page under the Logs section. Table of all operations, newest first:

```
Time          Type          Subject                   Duration  Status
2m ago        cert_issue    *.homelabza.com (DNS-01)  43s       ✓ success
5m ago        route_create  n8n.homelabza.com         <1s       ✓ success
1h ago        cert_renew    gitbay.homelabza.com      6s        ✓ success
2h ago        cert_issue    old.homelabza.com         31s       ✗ error
```

Click any row → expands to full step-by-step log.

### Navigation addition

"Operations" added to the sidebar under Logs:

```
LOGS
  Audit log
  Operations    ← new
  Activity feed
```

---

---

## 10. Access Lists — Full Redesign

### The problem with current approach

Currently ProxyOS has IP allowlists per route — a flat list of CIDRs. This is better than nothing but has three problems:
1. No block list mode — you can only allow, not deny specific IPs within a broader allow
2. No HTTP basic auth
3. No reusability — you re-enter the same IPs on every route

V3.1 replaces this with a proper **Access Lists** system: named, reusable access policies applied to routes.

### Access list structure

```typescript
interface AccessList {
  id: string
  name: string            // e.g. "Internal team", "Trusted clients", "Public"
  description?: string

  ipRules: IPRule[]
  basicAuth?: BasicAuthConfig
  satisfyMode: 'any' | 'all'
    // 'any' = pass if IP rule OR basic auth passes (more permissive)
    // 'all' = pass only if BOTH IP rule AND basic auth pass (stricter)
}

interface IPRule {
  type: 'allow' | 'deny'
  value: string           // CIDR or single IP
  comment?: string        // e.g. "Home network", "Office VPN"
  order: number           // rules evaluated in order
}

interface BasicAuthConfig {
  users: BasicAuthUser[]
  realm: string           // shown in browser login prompt, default "ProxyOS"
  protectedPaths?: string[] // if empty, protects entire route
}

interface BasicAuthUser {
  username: string
  passwordHash: string    // bcrypt, never store plaintext
}
```

### Access lists page (`/access-lists`)

New top-level page under Tools section.

```
TOOLS
  Import
  Access lists    ← new
  Audit log
  Operations
```

**Access lists table:**

```
Name                  IP rules    Auth users    Routes using it    Actions
Internal team         2 CIDRs     3 users       4 routes           Edit / Clone / Delete
Public API            None        None          2 routes           Edit / Clone / Delete
Trusted clients       1 CIDR      0 users       1 route            Edit / Clone / Delete
```

### Create / edit access list

**IP Rules section:**

```
IP rules                                     Mode: [Allow list ▼] / [Block list ▼]
─────────────────────────────────────────────
192.168.0.0/16    Home network      allow    [↕] [✕]
10.0.0.0/8        VPN range         allow    [↕] [✕]
192.168.1.50      Rogue device      deny     [↕] [✕]

[+ Add IP rule]
[Detect my current IP]    → pre-fills your current IP

Rules are evaluated top to bottom. First match wins.
[Test an IP address: _____________ ]  [Check]
→ "192.168.1.50 → DENY (matched rule 3)"
→ "192.168.1.100 → ALLOW (matched rule 1)"
```

**Basic auth section:**

```
HTTP Basic Auth                              [toggle — default OFF]
─────────────────────────────────────────────
When enabled, visitors must enter a username and password.
The browser shows a login prompt.

Realm (shown in browser login prompt):   [ProxyOS              ]

Users:
  darius     ●●●●●●●●   [👁] [✕]
  admin      ●●●●●●●●   [👁] [✕]

[+ Add user]

Protect specific paths only (optional):
  /admin/*
  [+ Add path]
  Leave empty to protect the entire route.
```

**Satisfy mode:**

```
Access mode:
  ○ Allow if IP OR password matches   — more permissive, easier for mixed usage
  ● Allow only if IP AND password match — strictest, requires both
```

**Preview:**

```
With these settings:
  Visitors from 192.168.0.0/16 or 10.0.0.0/8 AND who provide valid credentials
  can access this route.
  All other visitors receive 403 Forbidden.
```

### Applying access lists to routes

In the route detail side panel → Access tab:

```
Access list:  [None selected ▼]
               ─────────────────
               None (open access)
               Internal team
               Public API
               Trusted clients
               ─────────────────
               + Create new access list

[Save]
```

In the expose wizard Step 3 (Access), the SSO toggle remains as-is, but the IP/auth controls are replaced by the access list picker:

```
Access list:  [None — public access ▼]  [+ Create]
```

### Named access lists = one change, all routes update

When you edit a named access list (e.g. add an IP to "Internal team"), all routes using that access list immediately get the updated rules pushed to Caddy. No per-route editing needed.

### Backward compatibility

Existing per-route IP allowlists (from V1/V2/V3) are automatically migrated to named access lists named "Migrated rule — {domain}" with a note that they can be consolidated. A migration banner appears on the Access Lists page after upgrade:

```
ℹ  3 routes have inline IP rules from a previous version.
   These have been converted to access lists automatically.
   You may want to consolidate them.
   [View migrated access lists]
```

---

---

## 11. Pre-flight Checks

Pre-flight checks run before committing any operation that could fail. They surface problems early with clear explanations rather than cryptic Caddy errors.

### Check: upstream reachability

Triggered in expose wizard Step 1 when user enters an IP:port.

```typescript
async function checkUpstreamReachable(host: string, port: number): Promise<PreflightResult> {
  // TCP connect attempt with 3s timeout
  // Returns: reachable, latency_ms, error
}
```

UI feedback:
```
192.168.69.25:5678
  ✓ Service responding (12ms)    ← green, proceed

192.168.69.25:9999
  ✗ Nothing listening at this address
    Check that the service is running and the port is correct.
    [Retry]
```

### Check: DNS resolution

Triggered in expose wizard Step 2 when user enters a domain.

```typescript
async function checkDomainDNS(domain: string): Promise<PreflightResult> {
  // Resolves domain via 1.1.1.1 and 8.8.8.8
  // Compares resolved IP against server's public IP (from env or auto-detected)
  // Returns: resolves, resolved_ip, matches_server, propagated
}
```

UI feedback:
```
app.homelabza.com
  ✓ Resolves to 23.95.170.217 — matches this server    ← proceed

staging.homelabza.com
  ✗ Resolves to 1.2.3.4 — does not match this server (23.95.170.217)
    Certificate issuance will fail until DNS is updated.
    [Proceed anyway]  [What is my server's IP?]

newdomain.com
  ✗ Domain does not resolve — DNS may not be configured yet
    If you just added a DNS record, wait a few minutes and retry.
    [Retry]  [Proceed anyway — I'll fix DNS later]
```

### Check: port 80 reachability (HTTP-01 only)

Triggered when HTTP-01 is selected as the cert method.

```typescript
async function checkPort80(domain: string): Promise<PreflightResult> {
  // Makes external request to http://domain/.well-known/acme-challenge/test
  // (ProxyOS temporarily serves this)
  // Returns: reachable, error
}
```

UI feedback:
```
HTTP-01 pre-flight check
  ✓ Port 80 reachable from the internet    ← proceed

  ✗ Port 80 is not reachable
    Let's Encrypt cannot verify your domain using this method.

    Common causes:
    • Port 80 is blocked by your router or firewall
    • Your domain doesn't point to this server yet
    • A firewall rule is blocking inbound HTTP

    Options:
    [Switch to DNS-01]    ← recommended if you have a supported DNS provider
    [Check DNS first]
    [Proceed anyway]
```

### Check: DNS provider connected (DNS-01 only)

```
DNS-01 requires a connected DNS provider.

✓ Cloudflare connected — homelabza.com zone available
✗ No DNS provider connected
  [Connect Cloudflare]  [Connect Route53]  [Connect Hetzner DNS]
```

### Check: Let's Encrypt rate limit

```
⚠ Rate limit warning
  You have issued 47 of 50 certificates this week for homelabza.com.
  You have 3 remaining. Consider using ZeroSSL for this certificate.
  [Switch to ZeroSSL]  [Continue with Let's Encrypt]
```

---

---

## 12. HTTP → HTTPS Global Redirect

A global setting that makes every HTTP request on port 80 redirect to HTTPS. Should be on by default for new installations. Currently users who want this need to manually configure it.

### Settings location

Settings → General → **HTTP behaviour**:

```
Force HTTPS
Redirect all HTTP traffic (port 80) to HTTPS automatically.
Recommended for all installations.
[toggle — default ON]

When ON, visitors to http://yourdomain.com are automatically
sent to https://yourdomain.com. Required for HSTS.
```

### Caddy implementation

```json
{
  "apps": {
    "http": {
      "servers": {
        "http_redirect": {
          "listen": [":80"],
          "routes": [{
            "handle": [{
              "handler": "static_response",
              "status_code": 308,
              "headers": {
                "Location": ["https://{http.request.host}{http.request.uri}"]
              }
            }]
          }]
        }
      }
    }
  }
}
```

308 (Permanent Redirect) preserves the HTTP method — better than 301 which browsers may change POST → GET.

---

---

## 13. Let's Encrypt Rate Limit Indicator

Let's Encrypt enforces a limit of 50 certificates per registered domain per week. During development, testing, or rapid iteration this limit is easy to hit — and the error is cryptic.

### Rate limit tracking

ProxyOS tracks every cert issued via Let's Encrypt in the `cert_issuance_log` table. It calculates current usage per registered domain (the eTLD+1 — for `app.homelabza.com` this is `homelabza.com`).

```typescript
async function getRateLimitStatus(domain: string): Promise<RateLimitStatus> {
  const registeredDomain = getRegisteredDomain(domain)  // homelabza.com
  const weekStart = startOfWeek(new Date())

  const count = await db.query.certIssuanceLog.findMany({
    where: and(
      eq(certIssuanceLog.registeredDomain, registeredDomain),
      gte(certIssuanceLog.issuedAt, weekStart),
      eq(certIssuanceLog.provider, 'letsencrypt')
    )
  })

  return {
    registeredDomain,
    used: count.length,
    limit: 50,
    resetsAt: endOfWeek(new Date()),
    nearLimit: count.length >= 45,
    atLimit: count.length >= 50
  }
}
```

### Where it shows

**Certificates page header (when near/at limit):**
```
⚠ Let's Encrypt rate limit: 47/50 this week for homelabza.com
  Resets in 3 days. Consider using ZeroSSL for new certificates.
  [Set ZeroSSL as default]
```

**In the expose wizard and cert helper (before issuance):**
```
⚠ 47 of 50 Let's Encrypt certificates used this week for homelabza.com
  [Use ZeroSSL instead]  [Continue with Let's Encrypt (3 remaining)]
```

**At limit:**
```
✗ Let's Encrypt rate limit reached for homelabza.com
  You cannot issue more Let's Encrypt certificates this week.
  Resets in 3 days (Thursday, April 19).
  [Use ZeroSSL]
```

---

---

## 14. Navigation Changes

### Updated sidebar nav order

```
Dashboard
Routes
  ↳ Proxy routes (existing)
  ↳ Redirect hosts (new)
  ↳ Streams (new)
  ↳ Error hosts (new)
Analytics
Certificates
  ↳ All certificates
  ↳ Wildcard certs (new section)
  ↳ Certificate helper (new)

FEDERATION
  Agents
  Connections
  Scanner

TOOLS
  Import
  Access lists    ← new
  Audit log
  Operations      ← new (was under audit log)
  Activity feed

Settings
```

### Routes page — type tabs

The routes table gains a type filter at the top:

```
[All]  [Proxy]  [Redirects]  [Streams]  [Error hosts]
```

Each type shows its own relevant columns. "All" shows a Type badge column.

---

---

## 15. Database Schema Additions

```sql
-- Redirect hosts
CREATE TABLE redirect_hosts (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT REFERENCES agents(id),
  source_domain   TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  redirect_code   INTEGER NOT NULL DEFAULT 301,  -- 301 or 302
  preserve_path   INTEGER NOT NULL DEFAULT 1,
  preserve_query  INTEGER NOT NULL DEFAULT 1,
  tls_enabled     INTEGER NOT NULL DEFAULT 1,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Streams (TCP/UDP)
CREATE TABLE streams (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT REFERENCES agents(id),
  listen_port     INTEGER NOT NULL,
  protocol        TEXT NOT NULL DEFAULT 'tcp',   -- 'tcp' | 'udp' | 'tcp+udp'
  upstream_host   TEXT NOT NULL,
  upstream_port   INTEGER NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Error/dead hosts
CREATE TABLE error_hosts (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT REFERENCES agents(id),
  domain          TEXT NOT NULL,
  status_code     INTEGER NOT NULL DEFAULT 404,
  page_type       TEXT NOT NULL DEFAULT 'default',  -- 'default' | 'custom_html' | 'redirect'
  custom_html     TEXT,
  redirect_url    TEXT,
  tls_enabled     INTEGER NOT NULL DEFAULT 1,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Access lists (named, reusable)
CREATE TABLE access_lists (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  satisfy_mode    TEXT NOT NULL DEFAULT 'any',  -- 'any' | 'all'
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Access list IP rules
CREATE TABLE access_list_ip_rules (
  id              TEXT PRIMARY KEY,
  access_list_id  TEXT NOT NULL REFERENCES access_lists(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,     -- 'allow' | 'deny'
  value           TEXT NOT NULL,     -- CIDR or IP
  comment         TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- Access list basic auth users
CREATE TABLE access_list_auth_users (
  id              TEXT PRIMARY KEY,
  access_list_id  TEXT NOT NULL REFERENCES access_lists(id) ON DELETE CASCADE,
  username        TEXT NOT NULL,
  password_hash   TEXT NOT NULL,     -- bcrypt
  UNIQUE(access_list_id, username)
);

-- Access list basic auth config
CREATE TABLE access_list_auth_config (
  access_list_id  TEXT PRIMARY KEY REFERENCES access_lists(id) ON DELETE CASCADE,
  realm           TEXT NOT NULL DEFAULT 'ProxyOS',
  protected_paths TEXT            -- JSON array of path patterns, null = entire route
);

-- Route → access list mapping
ALTER TABLE routes ADD COLUMN access_list_id TEXT REFERENCES access_lists(id);
ALTER TABLE redirect_hosts ADD COLUMN access_list_id TEXT REFERENCES access_lists(id);

-- Operation logs
CREATE TABLE operation_logs (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'in_progress',
  steps           TEXT NOT NULL DEFAULT '[]',   -- JSON array of OperationStep
  duration_ms     INTEGER,
  error           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Cert issuance log (for rate limit tracking)
CREATE TABLE cert_issuance_log (
  id                TEXT PRIMARY KEY,
  domain            TEXT NOT NULL,
  registered_domain TEXT NOT NULL,        -- eTLD+1 for rate limit grouping
  provider          TEXT NOT NULL,        -- 'letsencrypt' | 'zerossl' | 'internal' | 'custom'
  method            TEXT,                 -- 'http01' | 'dns01'
  issued_at         INTEGER NOT NULL,
  expires_at        INTEGER
);

CREATE INDEX idx_cert_issuance_registered_domain ON cert_issuance_log(registered_domain, issued_at);
```

---

---

## 16. API Surface Additions

```typescript
// Redirect hosts
redirectHosts.list()
redirectHosts.get(id)
redirectHosts.create(input)
redirectHosts.update(id, input)
redirectHosts.delete(id)
redirectHosts.enable(id)
redirectHosts.disable(id)

// Streams
streams.list()
streams.get(id)
streams.create(input)
streams.update(id, input)
streams.delete(id)
streams.checkUpstream(host, port)   // pre-flight probe

// Error hosts
errorHosts.list()
errorHosts.get(id)
errorHosts.create(input)
errorHosts.update(id, input)
errorHosts.delete(id)

// Access lists
accessLists.list()
accessLists.get(id)
accessLists.create(input)
accessLists.update(id, input)
accessLists.delete(id)
accessLists.testIP(id, ip)          // test if an IP passes the access list
accessLists.getRoutesUsing(id)      // which routes use this access list

// Pre-flight checks
preflight.checkUpstream(host, port)
preflight.checkDNS(domain)
preflight.checkPort80(domain)
preflight.checkDNSProvider(domain)
preflight.checkRateLimit(domain, provider)

// Operation logs
operationLogs.list(limit?, type?, status?)
operationLogs.get(id)
operationLogs.subscribe(id)         // WebSocket — live step stream for in-progress operations

// Cert helpers
certificates.getWildcardInfo(domain)  // coverage, routes using, DNS provider status
certificates.getRateLimitStatus(domain)
certificates.downloadCA()             // download internal CA root cert
certificates.getTrustInstructions(platform)  // 'chrome' | 'macos' | 'windows' | 'ios' | 'android' | 'curl'
```

---

---

## 17. Build Order

```
Phase 1 — Version bump
  1.1  packages/types/src/version.ts → PROXYOS_VERSION = '3.1.0'
  1.2  Sidebar version badge → v3.1
  1.3  User area sub-line → v3.1
  1.4  Page title → ProxyOS v3.1

Phase 2 — Database migrations
  2.1  All schema additions from Section 15
  2.2  Migration: convert existing inline IP allowlists → named access lists

Phase 3 — Host type expansions
  3.1  Redirect hosts — DB, tRPC, Caddy config builder, UI wizard
  3.2  Error/dead hosts — DB, tRPC, Caddy config builder, UI wizard
  3.3  Streams — DB, tRPC, layer4 Caddy config builder, UI wizard
       (Note: rebuild Docker image with xcaddy + caddy-l4 for streams)
  3.4  Routes table — type tabs (All/Proxy/Redirects/Streams/Error)
  3.5  Navigation additions (sidebar type grouping)

Phase 4 — Pre-flight checks
  4.1  preflight.checkUpstream — TCP probe
  4.2  preflight.checkDNS — resolver comparison
  4.3  preflight.checkPort80 — external reachability
  4.4  preflight.checkRateLimit — LE rate limit lookup
  4.5  Wire into expose wizard Step 1 (upstream) + Step 2 (DNS + port 80)
  4.6  Wire into cert helper wizard

Phase 5 — Certificate improvements
  5.1  Certificate type picker — expanded explanation cards
  5.2  Internal CA trust instructions modal (all 6 platforms)
  5.3  Wildcard certificate dedicated UI section
  5.4  Certificate helper wizard (/certificates/new)
  5.5  Certificate detail page (/certificates/[id])
  5.6  Certificate editing (add/remove SANs, change method, force renew)
  5.7  Cert chain viewer
  5.8  Download formats (PEM, PKCS12, DER)

Phase 6 — Operation logs
  6.1  operation_logs table + OperationLogService
  6.2  Wire logging into: cert issuance, cert renewal, route creation, agent push
  6.3  WebSocket stream for live log (in expose wizard + cert helper)
  6.4  /logs/operations page
  6.5  Expandable log rows with full step detail

Phase 7 — Access lists redesign
  7.1  Access lists DB schema
  7.2  accessLists tRPC router
  7.3  /access-lists page (list + CRUD)
  7.4  IP rules editor (allow/deny, ordered, test input)
  7.5  Basic auth editor (users, realm, path protection)
  7.6  Satisfy mode toggle
  7.7  Access list picker in route detail + expose wizard
  7.8  Caddy config builder for access lists (IP matchers + basicauth handler)
  7.9  Migration of existing inline IP allowlists

Phase 8 — Global settings
  8.1  HTTP → HTTPS global redirect toggle (Settings → General)
  8.2  Let's Encrypt rate limit indicator (Certificates page + cert issuance)
  8.3  cert_issuance_log table + rate limit tracking service

Phase 9 — Navigation polish
  9.1  Sidebar nav updates (access lists, operations log)
  9.2  Routes table type filter tabs
  9.3  README version bump → v3.1
```

---

*ProxyOS V3.1 Feature Spec — proxyos.app — April 2026*
