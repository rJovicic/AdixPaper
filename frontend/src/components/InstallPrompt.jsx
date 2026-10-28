import { useEffect, useState } from 'react'
import { Download, MoreVertical, Share, SquarePlus, Smartphone, X } from 'lucide-react'
import { useI18n } from '../i18n'
import Dialog from './ui/Dialog'
import BrandLogo from './BrandLogo'
import { dismissInstall, promptInstall, useInstall } from '../lib/install'

const SHOW_AFTER_MS = 2500

/** Step-by-step "add to home screen" for browsers without an install prompt (iPhone/iPad above all). */
export function InstallDialog({ onClose }) {
  const { t } = useI18n()
  const install = useInstall()
  const ios = install.platform.startsWith('ios')
  const steps = ios
    ? [
        { icon: Share, text: t('install.iosStep1') },
        { icon: SquarePlus, text: t('install.iosStep2') },
        { icon: Smartphone, text: t('install.iosStep3') },
      ]
    : [
        { icon: MoreVertical, text: t('install.otherStep1') },
        { icon: Download, text: t('install.otherStep2') },
      ]
  return (
    <Dialog
      title={t('install.title')}
      description={install.installed ? t('install.already') : t('install.why')}
      onClose={onClose}
      size="sm"
      footer={<button type="button" className="btn-primary" onClick={onClose}>{t('install.done')}</button>}
    >
      {!install.installed && (
        <>
          <ol className="space-y-3">
            {steps.map(({ icon: Icon, text }, index) => (
              <li key={text} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-wash numeral text-sm text-brand">{index + 1}</span>
                <span className="flex min-w-0 flex-1 items-start gap-2 pt-1">
                  <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
                  <span>{text}</span>
                </span>
              </li>
            ))}
          </ol>
          {install.platform === 'ios-other' && <p className="mt-4 text-meta text-ink-2">{t('install.iosOtherBrowser')}</p>}
        </>
      )}
    </Dialog>
  )
}

/** "Install" for the account menu: the native prompt where the browser offers one, otherwise the steps. */
export function useInstallAction() {
  const install = useInstall()
  const [showSteps, setShowSteps] = useState(false)
  const start = async () => {
    if (install.canPrompt) {
      const outcome = await promptInstall()
      if (outcome !== 'unavailable') return
    }
    setShowSteps(true)
  }
  return {
    visible: !install.installed,
    start,
    dialog: showSteps ? <InstallDialog onClose={() => setShowSteps(false)} /> : null,
  }
}

/**
 * A one-time card on phones: shown shortly after the app opens, never again once dismissed or
 * installed. `hidden` keeps it off screens where it would get in the way (the report form).
 */
export default function InstallPrompt({ hidden = false, offsetForTabBar = true }) {
  const { t } = useI18n()
  const install = useInstall()
  const [ready, setReady] = useState(false)
  const [showSteps, setShowSteps] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const phone = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const show = ready && !hidden && phone && install.available && !install.dismissed

  const accept = async () => {
    if (install.canPrompt) {
      const outcome = await promptInstall()
      if (outcome === 'dismissed') dismissInstall()
      return
    }
    setShowSteps(true)
  }

  return (
    <>
      {show && (
        <aside
          aria-label={t('install.title')}
          className={`enter-rise fixed inset-x-3 z-[60] mx-auto max-w-md rounded-lg border border-rule bg-stock p-3 shadow-dialog sm:hidden ${
            offsetForTabBar ? 'bottom-[calc(4.25rem+env(safe-area-inset-bottom))]' : 'bottom-[max(0.75rem,env(safe-area-inset-bottom))]'
          }`}
        >
          <div className="flex items-start gap-3">
            <BrandLogo size="sm" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{t('install.bannerTitle')}</p>
              <p className="mt-0.5 text-meta text-ink-2">{t('install.bannerBody')}</p>
            </div>
            <button type="button" className="btn-icon -mr-1 -mt-1 h-10 w-10" aria-label={t('install.notNow')} onClick={dismissInstall}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={dismissInstall}>{t('install.notNow')}</button>
            <button type="button" className="btn-primary flex-1" onClick={accept}>
              <Download size={17} aria-hidden="true" /> {install.canPrompt ? t('install.install') : t('install.how')}
            </button>
          </div>
        </aside>
      )}
      {showSteps && (
        <InstallDialog
          onClose={() => {
            setShowSteps(false)
            dismissInstall() // they have seen how; the menu keeps the steps
          }}
        />
      )}
    </>
  )
}
