'use client'

import { useEffect } from 'react'
import { ErrorRecovery } from '@/components/error-recovery'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return <ErrorRecovery reset={reset} />
}
