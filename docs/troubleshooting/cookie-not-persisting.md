# Problem: Cookie Not Persisting

## Symptoms

- You log in and are redirected to the dashboard
- Refreshing the page returns you to the login screen
- The session cookie disappears from the browser's cookie storage
- Opening the dashboard in a new tab requires logging in again
- The issue occurs in some browsers but not others

## Why this happens

The ProxyOS session cookie requires specific conditions to persist. If any condition is violated, the browser either never stores the cookie or immediately discards it.

**`Secure` flag on HTTP**: The session cookie has `Secure=true`. Browsers refuse to store Secure cookies when the page was loaded over plain HTTP (`http://`). This is the most common cause.

**`SameSite=Lax` across different origins**: If the login form submits to a different origin than the page that receives the redirect, the cookie may be blocked on the first navigation.

**Third-party cookie blocking**: If the dashboard domain and the API domain are different origins, modern browsers with aggressive privacy settings block the cookie.

**Short session lifetime / early expiry**: ProxyOS sessions have a configured lifetime. If the session expires quickly (or the server clock is wrong), the cookie becomes invalid and is not sent.

**Browser private/incognito mode**: Cookies do not persist across tabs or after the window is closed in private mode.

## Diagnosis

**Check the Set-Cookie header:**

Open DevTools → Network tab, log in, find the login response (POST to a tRPC endpoint). Click it and look at Response Headers for `Set-Cookie`.

Check:
- Does the header exist?
- Does it have `Secure`? If so, the page must be served over HTTPS.
- Does it have `HttpOnly`? (expected — this is correct)
- What is the `Domain` and `Path`?
- What is the `Expires` / `Max-Age`?

**Check if the cookie is stored:**

DevTools → Application → Cookies → select your domain. Is the cookie present after login?

**Check the scheme:**

Is the URL `http://` or `https://`? If `http://`, the `Secure` cookie will not be stored.

## Fix

### Fix 1: Serve the dashboard over HTTPS

This is the correct fix for production. Create a ProxyOS route for the dashboard's domain with TLS mode `auto` or `internal`, then access the dashboard at `https://`.

### Fix 2: For local HTTP testing

If you are intentionally running over HTTP (local dev, LAN without TLS), ensure `PROXYOS_URL` is set to `http://` (not `https://`):

```env
PROXYOS_URL=http://192.168.1.x:3091
```

If the application generates `Secure` cookies unconditionally in production mode, HTTP access will not work reliably. The production-grade solution is always TLS.

### Fix 3: Use a consistent hostname

Access the dashboard at the same hostname every time. If `PROXYOS_URL=https://proxyos.yourdomain.com`, always use that URL. Do not mix IP and hostname access.

### Fix 4: Check server clock

Cookie expiry is evaluated against the server's clock. If the container's clock is significantly off, cookies may appear expired immediately.

```bash
docker compose exec proxyos date
date  # compare with host
```

Fix with:

```bash
# On the host
timedatectl set-ntp true
```

## Prevention

- Always serve the dashboard over HTTPS in production
- Set `PROXYOS_URL` to the canonical HTTPS URL
- Don't access the dashboard from a mix of HTTP and HTTPS URLs

## Related

- [Not Authenticated](not-authenticated.md)
- [Secret Rotation Logout](secret-rotation-logout.md)
- [Docker Compose Reference](../getting-started/docker-compose-reference.md)
