'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Refetches the page once a background Google sync changed events.
export default function RefreshOnSync({ changed }: { changed: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (changed) router.refresh()
  }, [changed, router])
  return null
}
