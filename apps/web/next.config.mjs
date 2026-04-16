const NODE_BUILTINS = ['path', 'fs', 'fs/promises', 'readline', 'better-sqlite3', 'bindings', 'http', 'https', 'net', 'tls', 'crypto', 'ws']

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: '../../',
  transpilePackages: ['@proxyos/alerts', '@proxyos/analytics', '@proxyos/api', '@proxyos/caddy', '@proxyos/connect', '@proxyos/db', '@proxyos/federation', '@proxyos/importers', '@proxyos/scanner', '@proxyos/sso', '@proxyos/types'],
  serverExternalPackages: ['better-sqlite3', 'bindings', 'ws'],
  webpack: (config, { isServer, nextRuntime }) => {
    if (nextRuntime === 'edge' || !isServer) {
      const existing = config.resolve?.fallback ?? {}
      config.resolve = config.resolve ?? {}
      config.resolve.fallback = {
        ...existing,
        path: false,
        fs: false,
        'fs/promises': false,
        readline: false,
        'better-sqlite3': false,
        bindings: false,
        http: false,
        https: false,
        net: false,
        tls: false,
        crypto: false,
        ws: false,
      }
    }
    if (isServer && nextRuntime === 'nodejs') {
      config.externals = config.externals || []
      config.externals.push({
        'better-sqlite3': 'commonjs better-sqlite3',
        bindings: 'commonjs bindings',
        ws: 'commonjs ws',
      })
    }
    return config
  },
}

void NODE_BUILTINS

export default nextConfig
