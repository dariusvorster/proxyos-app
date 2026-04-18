import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter, createContext } from '@proxyos/api'

export const runtime = 'nodejs'

const handler = async (req: Request) => {
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
  })

  // Interception layer: if the tRPC response body contains a __setCookie field,
  // extract it and set as a real Set-Cookie header, then strip it from the body.
  // This works around a Next.js standalone build bug where ctx.resHeaders is
  // not properly plumbed through to tRPC handlers.
  try {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const bodyText = await response.text()
      let parsedBody: unknown = null
      try {
        parsedBody = JSON.parse(bodyText)
      } catch {
        // Not valid JSON — return original response
        return new Response(bodyText, {
          status: response.status,
          headers: response.headers,
        })
      }

      const cookiesToSet: string[] = []
      
      // tRPC batch responses are arrays; individual calls might be objects
      const items = Array.isArray(parsedBody) ? parsedBody : [parsedBody]
      
      for (const item of items) {
        if (typeof item === 'object' && item !== null) {
          // Drill into result.data.json.__setCookie (tRPC transformer structure)
          const data = (item as Record<string, unknown>)?.result as Record<string, unknown> | undefined
          const dataData = data?.data as Record<string, unknown> | undefined
          const dataJson = dataData?.json as Record<string, unknown> | undefined
          const setCookie = dataJson?.__setCookie
          
          if (typeof setCookie === 'string' && setCookie.length > 0) {
            cookiesToSet.push(setCookie)
            // Remove from response body so client doesn't see it
            delete (dataJson as Record<string, unknown>).__setCookie
          }
        }
      }

      // Build new response with Set-Cookie header(s) injected
      const newHeaders = new Headers(response.headers)
      for (const cookie of cookiesToSet) {
        newHeaders.append('Set-Cookie', cookie)
      }

      const newBody = JSON.stringify(parsedBody)
      // Update content-length since we may have modified the body
      newHeaders.set('content-length', String(Buffer.byteLength(newBody)))

      return new Response(newBody, {
        status: response.status,
        headers: newHeaders,
      })
    }
  } catch (err) {
    console.error('[trpc-route] cookie interception failed:', err)
    // Fall through to return original response
  }

  return response
}

export { handler as GET, handler as POST }
