# Expose a Service

Four ways to route traffic to a backend through ProxyOS.

---

## 1. Manual route creation

1. In the UI, go to **Routes** and click **New Route**.
2. Fill in:
   - **Domain** — the public hostname (e.g. `app.example.com`)
   - **Upstream** — the backend address (e.g. `http://192.168.1.10:8080` or `http://mycontainer:8080`)
   - **TLS mode** — `Auto` for public HTTPS, `Off` for HTTP-only (see [SSL/TLS](ssl-tls.md))
3. Optional settings:
   - **WebSocket** — enable if the backend uses WebSocket connections
   - **HTTP/2 upstream** — enable for gRPC or HTTP/2 backends
   - **Compression** — enable gzip/zstd response compression
   - **Headers** — add, remove, or rewrite request/response headers
4. Click **Save**. ProxyOS pushes the route to Caddy immediately.

Caddy begins serving the route within seconds. If TLS mode is Auto, certificate issuance starts automatically.

---

## 2. Docker Scanner

The Docker Scanner inspects running containers via the Docker socket and suggests routes.

1. Go to **Routes** → **Docker Scanner** (or the Scanner icon in the sidebar).
2. ProxyOS lists detected containers with suggested domain and upstream values.
3. Click **Import** next to any container to create a route from the suggestion.
4. Review and adjust the domain before saving.

The scanner uses three sources to build suggestions, in priority order:
1. ProxyOS native labels on the container
2. Traefik labels on the container
3. Heuristics (exposed ports, image name)

---

## 3. ProxyOS native labels

Add labels to a Docker container and the scanner will produce an exact route with no guesswork:

```yaml
services:
  myapp:
    image: myapp:latest
    labels:
      proxyos.enable: "true"
      proxyos.host: "app.example.com"
      proxyos.port: "8080"
      proxyos.tls: "auto"           # auto | dns | internal | off
      proxyos.websocket: "true"     # optional
```

Supported labels:

| Label | Description |
|---|---|
| `proxyos.enable` | Set to `"true"` to include this container in scanner results |
| `proxyos.host` | Public hostname for the route |
| `proxyos.port` | Container port to use as upstream |
| `proxyos.tls` | TLS mode: `auto`, `dns`, `internal`, or `off` |
| `proxyos.websocket` | Enable WebSocket support (`"true"` or `"false"`) |

---

## 4. Traefik label compatibility

ProxyOS reads Traefik labels and converts them to routes. Containers with existing Traefik configuration work without relabelling:

```yaml
services:
  myapp:
    image: myapp:latest
    labels:
      traefik.enable: "true"
      traefik.http.routers.myapp.rule: "Host(`app.example.com`)"
      traefik.http.services.myapp.loadbalancer.server.port: "8080"
```

The scanner extracts the host rule and port and pre-fills the route form. You still review and confirm before the route is created.

---

## Upstream formats

| Format | Example |
|---|---|
| IP + port | `http://192.168.1.10:8080` |
| Docker container name | `http://mycontainer:8080` |
| Hostname | `http://internal.host:3000` |
| HTTPS upstream | `https://backend.internal:8443` |

When the upstream is an HTTPS address, Caddy forwards TLS. Use the **HTTP/2 upstream** option for gRPC or h2c backends.
