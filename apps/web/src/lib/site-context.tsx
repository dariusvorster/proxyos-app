'use client'

import { useCallback, useEffect, useState } from 'react'

const SITE_KEY = 'proxyos.selectedSiteId'

export function useSiteSelection() {
  const [siteId, setSiteId_] = useState<string | null>(null)

  useEffect(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(SITE_KEY) : null
    setSiteId_(stored ?? null)
  }, [])

  const setSiteId = useCallback((id: string | null) => {
    setSiteId_(id)
    if (typeof localStorage !== 'undefined') {
      if (id === null) localStorage.removeItem(SITE_KEY)
      else localStorage.setItem(SITE_KEY, id)
    }
  }, [])

  return { siteId, setSiteId }
}
