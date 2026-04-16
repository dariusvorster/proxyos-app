export { DockerScanner } from './docker/scanner'
export type { DockerScannerConfig, DetectedRoute, ScannedContainer } from './docker/scanner'
export { parseComposeFile } from './docker/compose-parser'
export { resolveUpstream, isLikelyHTTP } from './docker/upstream-resolver'
export type { ScannerContainer, ContainerNetwork, PortMapping } from './docker/upstream-resolver'
export { parseProxyOSLabels, proxyOSLabelsToRoute } from './docker/label-parser'
export type { ProxyOSLabels } from './docker/label-parser'

// Re-export ImportedRoute for consumers that use the compose parser
export type { ImportedRoute } from '@proxyos/importers'
