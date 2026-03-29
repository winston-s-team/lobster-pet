import { useState, useEffect } from 'react'
import './TokenBar.css'

interface TokenBarProps {
  // No props needed - fetches cumulative usage from main process
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k'
  return String(n)
}

export default function TokenBar(_props: TokenBarProps) {
  const [total, setTotal] = useState<number | null>(null)

  useEffect(() => {
    const api = window.lobsterAPI
    if (!api) return

    const fetch = async () => {
      try {
        const data: any = await api.getTokenUsage()
        if (data?.totalTokens != null) setTotal(data.totalTokens)
      } catch { /* ignore */ }
    }

    fetch()
    const timer = setInterval(fetch, 60_000) // Refresh every minute
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="token-label">
      📊 {total != null ? formatTokens(total) : '...'}
    </div>
  )
}
