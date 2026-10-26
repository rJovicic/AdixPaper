import { Outlet } from 'react-router'
import { LogOut } from 'lucide-react'
import BrandLogo from './BrandLogo'
import LanguageSwitch from './ui/LanguageSwitch'
import { useAuth } from '../auth/AuthProvider'
import { displayName } from '../auth/session'
import { useI18n } from '../i18n'

export default function WorkerShell() {
  const { user, signOut } = useAuth()
  const { t } = useI18n()
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-[80] rounded bg-stock px-4 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {t('nav.skip')}
      </a>
      <header className="sticky top-0 z-40 bg-brand-deep">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
          <BrandLogo size="sm" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight text-stock">{t('app.name')}</p>
            <p className="truncate text-meta text-brand-on-deep">{displayName(user)}</p>
          </div>
          <LanguageSwitch tone="deep" />
          <button
            type="button"
            onClick={() => signOut('signedOut')}
            className="btn-icon text-brand-on-deep hover:bg-white/10 hover:text-stock xs:w-auto xs:gap-2 xs:px-3"
            aria-label={t('common.signOut')}
          >
            <LogOut size={19} aria-hidden="true" />
            <span className="hidden text-sm font-medium xs:inline" aria-hidden="true">{t('common.signOut')}</span>
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-4 pb-16 pt-5 focus:outline-none">
        <Outlet />
      </main>
    </div>
  )
}
