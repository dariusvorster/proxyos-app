'use client'

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { createElement } from 'react'

function getTRPCErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const trpcErr = err as { data?: { code?: string }; message?: string }
    const serverMessage = trpcErr.message
    if (serverMessage && serverMessage !== 'Internal server error') {
      return serverMessage
    }
    switch (trpcErr.data?.code) {
      case 'UNAUTHORIZED': return 'You must be logged in to do this. If you believe you are logged in, try logging out and back in.'
      case 'FORBIDDEN': return 'You do not have permission to do this'
      case 'NOT_FOUND': return 'The requested resource was not found'
      case 'CONFLICT': return 'This resource already exists'
      case 'BAD_REQUEST': return 'Invalid request — check your input'
      case 'PRECONDITION_FAILED': return 'A prerequisite was not met — check system status'
      case 'TOO_MANY_REQUESTS': return 'Too many requests — please wait and try again'
      default: return 'Something went wrong — please try again'
    }
  }
  return err instanceof Error ? err.message : 'An unexpected error occurred'
}

/**
 * Returns [handleError, errorBanner].
 * Pass handleError directly as the onError option of any useMutation call.
 * Render errorBanner somewhere in the component tree (it is null when no error is active).
 * The banner auto-dismisses after 4 seconds.
 */
export function useErrorHandler(): [
  handleError: (err: unknown) => void,
  errorBanner: ReactNode,
] {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleError = useCallback((err: unknown) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage(getTRPCErrorMessage(err))
    timerRef.current = setTimeout(() => setMessage(null), 4000)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const errorBanner = message
    ? createElement(
        'div',
        {
          onClick: () => setMessage(null),
          style: {
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            maxWidth: 360,
            background: 'var(--red-dim, rgba(239,68,68,.12))',
            border: '1px solid var(--red-border, rgba(239,68,68,.35))',
            borderRadius: 'var(--radius, 6px)',
            padding: '10px 14px',
            fontSize: 13,
            color: 'var(--red, #ef4444)',
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,.15)',
          },
        },
        message,
      )
    : null

  return [handleError, errorBanner]
}
