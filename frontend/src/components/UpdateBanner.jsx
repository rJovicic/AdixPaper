import { useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { useI18n } from '../i18n'

const CHECK_EVERY_MS = 5 * 60 * 1000
const ENTRY = /\/assets\/index-[\w-]+\.js/

/**
 * Tabs left open across a deploy keep running the old code. This compares the
 * running bundle with the one the server now serves and offers a reload.
 */
export default function UpdateBanner() {
  const { t } = useI18n()
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return undefined
    const running = [...document.scripts].map((script) => script.src.match(ENTRY)?.[0]).find(Boolean)
    if (!running) return undefined

    const check = async () => {
      try {
        const html = await (await fetch('/', { cache: 'no-store' })).text()
        const served = html.match(ENTRY)?.[0]
        if (served && served !== running) setStale(true)
      } catch {
        // Offline or a deploy in progress; try again later.
      }
    }
    const onVisible = () => document.visibilityState === 'visible' && check()
    const timer = window.setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!stale) return null
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-[75] flex justify-center p-3 sm:bottom-4">
      <div className="enter-rise flex w-full max-w-md items-center gap-3 rounded-lg bg-brand-deep px-4 py-3 text-stock shadow-dialog">
        <p className="flex-1 text-[0.9375rem]">{t('update.available')}</p>
        <button type="button" onClick={() => window.location.reload()} className="btn btn-sm bg-stock text-key hover:bg-brand-wash">
          <RotateCw size={16} aria-hidden="true" /> {t('update.reload')}
        </button>
      </div>
    </div>
  )
}
