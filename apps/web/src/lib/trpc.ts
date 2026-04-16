'use client'

import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '@proxyos/api'

export const trpc = createTRPCReact<AppRouter>()
