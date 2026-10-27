import { NavLink, Outlet, useLocation } from 'react-router'
import { ClipboardList, Plus } from 'lucide-react'
import BrandLogo from './BrandLogo'
import AccountMenu from './AccountMenu'
import { useI18n } from '../i18n'

const tabClass = ({ isActive }) =>
  `flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${
    isActive ? 'text-brand' : 'text-ink-2 hover:text-ink'
  }`

export default function WorkerShell() {
  const { t } = useI18n()
  // On the report form the bar would ride above the phone keyboard and cover fields; the form has its own way back.
  const reporting = useLocation().pathname.startsWith('/radnik/prijava')
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-[80] rounded bg-stock px-4 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {t('nav.skip')}
      </a>
      <header className="sticky top-0 z-40 bg-brand-deep">
        <div className="mx-auto flex max-w-2xl items-center gap-3 py-2 pl-4 pr-2">
          <BrandLogo size="sm" />
          <p className="min-w-0 flex-1 truncate font-semibold text-stock">{t('app.name')}</p>
          <AccountMenu variant="bar" />
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`mx-auto max-w-2xl px-4 pt-5 focus:outline-none sm:pb-16 ${reporting ? 'pb-16' : 'pb-28'}`}>
        <Outlet />
      </main>
      {/* Phones: the two things a worker does stay under the thumb, however long the list. */}
      <nav hidden={reporting} aria-label={t('nav.main')} className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-stock/95 pb-0 backdrop-blur-sm sm:hidden">
        <div className="mx-auto flex max-w-2xl">
          <NavLink to="/radnik" end className={tabClass}>
            <ClipboardList size={22} aria-hidden="true" />
            {t('worker.title')}
          </NavLink>
          <NavLink to="/radnik/prijava" className={tabClass}>
            <Plus size={22} strokeWidth={2.5} aria-hidden="true" />
            {t('worker.report')}
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
