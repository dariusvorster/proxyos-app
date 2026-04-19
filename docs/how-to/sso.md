# SSO (Single Sign-On)

ProxyOS can protect any route with OAuth2. Users must authenticate before accessing the upstream service. Supported providers include Google, GitHub, and any OAuth2-compatible identity provider.

---

## 1. Create an OAuth provider

Before enabling SSO on a route, register a provider.

1. Go to **Settings** → **SSO Providers** and click **Add Provider**.
2. Select a provider type (Google, GitHub, or Generic OAuth2).
3. Fill in:
   - **Name** — a label for this provider (e.g. "Company Google")
   - **Client ID** — from your OAuth app registration
   - **Client Secret** — from your OAuth app registration
   - **Allowed domains** (optional) — restrict login to specific email domains (e.g. `example.com`)

### Google setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** of type **Web application**.
3. Add an authorised redirect URI: `https://yourdomain.com/_proxyos/oauth/callback`
4. Copy the Client ID and Client Secret into ProxyOS.

### GitHub setup

1. Go to [github.com/settings/developers](https://github.com/settings/developers) → OAuth Apps → New OAuth App.
2. Set **Authorization callback URL** to `https://yourdomain.com/_proxyos/oauth/callback`.
3. Copy the Client ID and generate a Client Secret.

---

## 2. Enable SSO on a route

1. Open an existing route or create a new one.
2. In the route editor, find the **SSO** section and toggle it on.
3. Select the provider you created.
4. Optionally configure:
   - **Session duration** — how long authentication cookies last
   - **Email whitelist** — restrict access to specific email addresses beyond the provider's domain filter

5. Save the route.

From this point, any request to the route that lacks a valid session cookie is redirected to the OAuth provider for login. After authentication, the user is redirected back to their original URL.

---

## 3. AccessOS group restrictions

AccessOS lets you restrict a route to specific groups defined in your identity provider, rather than all authenticated users.

1. Go to **Settings** → **AccessOS** and define one or more groups with membership rules (email list, domain, or OAuth claim).
2. In the route editor, under **SSO** → **Access Control**, select one or more AccessOS groups.
3. Save the route.

Users who authenticate successfully but are not members of any of the required groups receive a 403 response. Group membership is evaluated on each request using the session claims — no re-login is required when groups change, but the session must expire and be re-established for the new membership to take effect.

---

## Notes

- SSO adds a reverse proxy layer in front of the upstream. The upstream receives a forwarded request with the authenticated user's email in the `X-Forwarded-User` header.
- SSO requires TLS to be enabled on the route (Auto, DNS-01, or Internal). It will not work with TLS mode Off.
- Multiple routes can share the same SSO provider. Session cookies are scoped per route domain.
