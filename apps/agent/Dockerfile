FROM node:22-alpine AS builder
WORKDIR /build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/federation/package.json ./packages/federation/
COPY apps/agent/package.json ./apps/agent/

RUN pnpm install --frozen-lockfile

COPY packages/federation/src ./packages/federation/src
COPY packages/federation/tsconfig.json ./packages/federation/tsconfig.json
COPY apps/agent/src ./apps/agent/src
COPY apps/agent/tsconfig.json ./apps/agent/tsconfig.json
COPY tsconfig.base.json ./

RUN pnpm --filter @proxyos/agent build

# --- runner ---
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /build/apps/agent/dist ./dist
COPY --from=builder /build/node_modules ./node_modules

ENV CENTRAL_URL=ws://proxyos-central:7890
ENV AGENT_TOKEN=""
ENV AGENT_ID=""
ENV CADDY_ADMIN_URL=http://localhost:2019

CMD ["node", "dist/index.js"]
