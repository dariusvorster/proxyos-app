# Problem: Not Authenticated (401 after login)

## Symptoms

- You log in successfully and are redirected to the dashboard
- The dashboard immediately shows a 401 or redirects back to the login page
- Every API call returns `401 Unauthorized`
- The browser shows the login form in a loop

## Why this happens

ProxyOS uses `better-auth` for session management. The session token is stored in an HTTP-only cookie. A 401 loop after a successful login almost always means the cookie was set but the browser is not sending it back. The three most common causes:

1. **`Secure` flag + HTTP**: The cookie has `Secure=true` but the dashboard is served over plain HTTP. The browser silently drops a Secure cookie on a non-HTTPS connection.

2. **Wrong `PROXYOS_SECRET`**: The session was signed with a different secret than the one currently configured. This happens if `PROXYOS_SECRET` was changed between the login attempt and the session verification.

3. **`SameSite=Strict` across a redirect**: If ProxyOS is behind a proxy that changes the effective origin, the `SameSite` attribute may block the cookie on the first navigation after login.

4. **Cross-origin dashboard access**: Accessing the dashboard at a different hostname than the one the cookie was issued for (e.g., IP address vs. hostname).

## Diagnosis

Open browser DevTools → Application → Cookies, and find the ProxyOS session cookie.

Check:
- Is it present after the login redirect?
- Does it have the `Secure` attribute set?
- What domain and path does it have?
- Is the request to `/api/trpc/...` sending the cookie (Network tab → request headers → `Cookie:`)?

Check the container logs:

```bash
docker compose logs proxyos | grep -i "createContext\|auth\|cookie"
```

Look for the log line `[trpc] createContext called WITHOUT resHeaders` — this indicates the `resHeaders` fallback is in use (expected in production) and does not itself cause auth failures.

## Fix

### Fix 1: Serve the dashboard over HTTPS

If you are accessing the dashboard over plain HTTP, either:
- Put ProxyOS itself behind a route with TLS enabled, or
- Use `http://` and ensure `PROXYOS_URL` is also `http://` (not `https://`)

The simplest production setup is to create a ProxyOS route for the dashboard domain itself, with TLS mode `auto` or `internal`.

### Fix 2: Verify PROXYOS_SECRET is stable

```bash
docker compose exec proxyos env | grep PROXYOS_SECRET
```

Confirm the value matches what is in your `.env` file and has not changed since the session was issued. If you rotated the secret, all sessions are invalid — log in again and the new cookie will be issued correctly.

### Fix 3: Access via consistent hostname

Always access the dashboard at the same hostname (e.g., always `https://proxyos.yourdomain.com`, not sometimes by IP). Cookie domain scope must match.

## Prevention

- Always serve the dashboard over HTTPS in production
- Never change `PROXYOS_SECRET` without understanding it logs everyone out (see [Secret Rotation Logout](secret-rotation-logout.md))
- Set `PROXYOS_URL` to the canonical HTTPS URL of your dashboard

## Related

- [Cookie Not Persisting](cookie-not-persisting.md)
- [Secret Rotation Logout](secret-rotation-logout.md)
- [Container Won't Start](container-wont-start.md)
