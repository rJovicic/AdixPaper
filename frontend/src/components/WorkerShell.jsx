import { Link, Outlet, useLocation } from 'react-router'
import { ClipboardList, Home, QrCode, User } from 'lucide-react'
import { scanSupported } from '../lib/qr'
import { BrandOnNavy } from './BrandLogo'
import BottomNav from './BottomNav'
import Avatar from './ui/Avatar'
import InstallPrompt from './InstallPrompt'
import { useAuth } from '../auth/AuthProvider'
import { displayName } from '../auth/session'
import { useI18n } from '../i18n'

export default function WorkerShell() {
  const { t } = useI18n()
  const { user } = useAuth()
  // On the report form the bar would ride above the phone keyboard and cover fields; the form has its own way back.
  const { pathname } = useLocation()
  const reporting = pathname.startsWith('/radnik/prijava') || pathname.startsWith('/radnik/skeniraj')
  const tabs = [
    { to: '/radnik', label: t('nav.dashboard'), icon: Home, end: true },
    { to: '/radnik/kvarovi', label: t('nav.faults'), icon: ClipboardList },
    ...(scanSupported() ? [{ to: '/radnik/skeniraj', label: t('scan.tab'), icon: QrCode }] : []),
    { to: '/radnik/profil', label: t('nav.profile'), icon: User },
  ]
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-[80] rounded bg-stock px-4 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {t('nav.skip')}
      </a>
      <header className="pt-safe sticky top-0 z-40 bg-brand-deep">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 pl-4 pr-1.5">
          <Link to="/radnik" className="min-w-0 flex-1 rounded py-2">
            <BrandOnNavy label={t('app.name')} />
          </Link>
          <Link
            to="/radnik/profil"
            aria-label={t('account.profileOf', { name: displayName(user) })}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          >
            <Avatar user={user} tone="outline" />
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`mx-auto max-w-2xl px-4 pt-5 focus:outline-none ${reporting ? 'pb-12' : 'pb-28'}`}>
        <Outlet />
      </main>
      <BottomNav items={tabs} reportTo="/radnik/prijava" hidden={reporting} always />
      <InstallPrompt hidden={reporting} />
    </div>
  )
}
