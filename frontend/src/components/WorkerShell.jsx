import { Outlet } from 'react-router'
import BrandLogo from './BrandLogo'
import AccountMenu from './AccountMenu'
import { useI18n } from '../i18n'

export default function WorkerShell() {
  const { t } = useI18n()
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
      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-4 pb-16 pt-5 focus:outline-none">
        <Outlet />
      </main>
    </div>
  )
}
