# ── builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN sh scripts/check-no-js-shadows.sh
RUN pnpm --filter @proxyos/web build
# Bundle instrumentation.node.ts — webpackIgnore excludes it from Next.js standalone trace
RUN cd /repo/apps/web && node -e " \
  const esbuild = require('next/dist/compiled/esbuild'); \
  esbuild.buildSync({ \
    entryPoints: ['src/instrumentation.node.ts'], \
    bundle: true, \
    platform: 'node', \
    target: 'node22', \
    format: 'cjs', \
    external: ['better-sqlite3', 'fsevents', 'nodemailer'], \
    outfile: '.next/server/instrumentation.node.js' \
  })"

# ── caddy-builder ─────────────────────────────────────────────────────
FROM golang:1.25-alpine AS caddy-builder
RUN apk add --no-cache git ca-certificates wget
ARG CADDY_VERSION=2.11.2
ARG XCADDY_VERSION=0.4.4
RUN set -eux; \
    ARCH=$(case "$(uname -m)" in \
      x86_64)  echo amd64;; \
      aarch64) echo arm64;; \
      *) echo "unknown arch"; exit 1;; \
    esac); \
    wget -O /tmp/xcaddy.tar.gz "https://github.com/caddyserver/xcaddy/releases/download/v${XCADDY_VERSION}/xcaddy_${XCADDY_VERSION}_linux_${ARCH}.tar.gz"; \
    tar -xzf /tmp/xcaddy.tar.gz -C /usr/local/bin xcaddy; \
    rm /tmp/xcaddy.tar.gz; \
    chmod +x /usr/local/bin/xcaddy; \
    GOFLAGS=-mod=mod xcaddy build "v${CADDY_VERSION}" \
      --with github.com/mholt/caddy-l4 \
      --with github.com/caddy-dns/cloudflare \
      --with github.com/corazawaf/coraza-caddy/v2 \
      --output /usr/local/bin/caddy; \
    chmod +x /usr/local/bin/caddy

# ── runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache ca-certificates wget curl xz libc6-compat python3 make g++ logrotate

COPY --from=caddy-builder /usr/local/bin/caddy /usr/local/bin/caddy

# Install s6-overlay v3
ARG S6_VERSION=3.2.0.2
RUN set -eux; \
    ARCH=$(uname -m); \
    wget -O /tmp/s6-noarch.tar.xz "https://github.com/just-containers/s6-overlay/releases/download/v${S6_VERSION}/s6-overlay-noarch.tar.xz"; \
    wget -O /tmp/s6-arch.tar.xz   "https://github.com/just-containers/s6-overlay/releases/download/v${S6_VERSION}/s6-overlay-${ARCH}.tar.xz"; \
    tar -C / -Jxpf /tmp/s6-noarch.tar.xz; \
    tar -C / -Jxpf /tmp/s6-arch.tar.xz; \
    rm /tmp/s6-*.tar.xz

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV PROXYOS_DB_PATH=/data/proxyos/proxyos.db
ENV PROXYOS_ACCESS_LOG=/data/proxyos/access.log
ENV CADDY_BASE_CONFIG_PATH=/etc/caddy/base-config.json
ENV CADDY_ADMIN_URL=http://localhost:2019
ENV XDG_DATA_HOME=/data/caddy
ENV XDG_CONFIG_HOME=/config/caddy

# Next.js standalone output
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
# instrumentation.node.js is not in the standalone trace (webpackIgnore) — copy explicitly
COPY --from=builder /repo/apps/web/.next/server/instrumentation.node.js ./apps/web/.next/server/instrumentation.node.js

# Install native deps not bundled by Next standalone
RUN mkdir -p /tmp/native && cd /tmp/native && \
    echo '{}' > package.json && \
    npm install --no-save better-sqlite3@11.5.0 bindings@1.5.0 file-uri-to-path@1.0.0 && \
    mkdir -p /app/apps/web/node_modules && \
    cp -r /tmp/native/node_modules/. /app/apps/web/node_modules/ && \
    rm -rf /tmp/native

# Caddy base config — stored OUTSIDE the named volume so it always comes from the image
RUN mkdir -p /etc/caddy
COPY caddy/base-config.json /etc/caddy/base-config.json

# s6-overlay service definitions
COPY docker/s6-overlay/ /etc/s6-overlay/

# Log rotation config
COPY docker/logrotate/proxyos /etc/logrotate.d/proxyos
RUN find /etc/s6-overlay/s6-rc.d -name run -o -name up -o -name finish \
    | xargs chmod +x

RUN mkdir -p /data/proxyos /data/caddy /config/caddy

EXPOSE 80 443 3000
# Port 2019 (Caddy admin API) is intentionally NOT exposed — it must never be published externally
VOLUME ["/data/proxyos", "/data/caddy", "/config/caddy"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health | grep -q '"status":"ok"' || exit 1

# s6-overlay is the PID 1 init
ENTRYPOINT ["/init"]
