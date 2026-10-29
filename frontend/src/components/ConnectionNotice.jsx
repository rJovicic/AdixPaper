import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useI18n } from '../i18n'
import { useLiveStatus } from '../lib/live'

// A planned stream rotation reconnects within a second or two; only a longer gap is worth a word.
const RECONNECT_GRACE_MS = 8000

/**
 * Says so on every screen when what is shown may be behind: offline at once, a lost live
 * connection after a short grace. Screens keep their last data and refresh by themselves once
 * the connection is back (lib/live.jsx), so there is nothing for the person to press.
 */
export default function ConnectionNotice() {
  const { t } = useI18n()
  const status = useLiveStatus()
  const [lingering, setLingering] = useState(false)

  useEffect(() => {
    setLingering(false)
    if (status !== 'reconnecting') return undefined
    const timer = window.setTimeout(() => setLingering(true), RECONNECT_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  const message = status === 'offline' ? t('live.offline') : status === 'reconnecting' && lingering ? t('live.reconnecting') : ''
  return (
    <div role="status" aria-live="polite">
      {message && (
        <p className="flex items-center justify-center gap-2 border-b border-warn-mark/30 bg-warn-wash px-4 py-2 text-center text-sm font-semibold text-warn">
          <WifiOff size={15} aria-hidden="true" className="shrink-0" />
          {message}
        </p>
      )}
    </div>
  )
}
