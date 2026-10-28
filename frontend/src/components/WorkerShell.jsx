import { Link, Outlet, useLocation } from 'react-router'
import { ClipboardList, Home, PlusCircle, User } from 'lucide-react'
import { BrandOnNavy } from './BrandLogo'
import BottomNav from './BottomNav'
import InstallPrompt from './InstallPrompt'
import { useI18n } from '../i18n'

export default function WorkerShell() {
  const { t } = useI18n()
  // On the report form the bar would ride above the phone keyboard and cover fields; the form has its own way back.
  const { pathname } = useLocation()
  const reporting = pathname.startsWith('/radnik/prijava') || pathname.startsWith('/radnik/skeniraj')
  // Reporting stays one tap away; scanning a label is the home screen's main action where a camera exists.
  const tabs = [
    { to: '/radnik', label: t('nav.dashboard'), icon: Home, end: true },
    { to: '/radnik/kvarovi', label: t('nav.faults'), icon: ClipboardList },
    { to: '/radnik/prijava', label: t('nav.reportShort'), icon: PlusCircle },
    { to: '/radnik/profil', label: t('nav.profile'), icon: User },
  ]
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-[80] rounded bg-stock px-4 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {t('nav.skip')}
      </a>
      <header className="pt-safe sticky top-0 z-40 bg-brand-deep">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link to="/radnik" className="min-w-0 flex-1 rounded py-2">
            <BrandOnNavy label={t('app.name')} />
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`mx-auto max-w-2xl px-4 pt-5 focus:outline-none ${reporting ? 'pb-12' : 'pb-28'}`}>
        <Outlet />
      </main>
      <BottomNav items={tabs} hidden={reporting} always />
      <InstallPrompt hidden={reporting} />
    </div>
  )
}
