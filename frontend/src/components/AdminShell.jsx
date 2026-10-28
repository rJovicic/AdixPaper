import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { AlertTriangle, BarChart3, Factory, LayoutGrid, Menu as MenuIcon, MoreHorizontal, PackageSearch, QrCode, Search, Users, X } from 'lucide-react'
import { scanSupported } from '../lib/qr'
import BrandLogo from './BrandLogo'
import AccountMenu from './AccountMenu'
import SearchPalette from './SearchPalette'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../i18n'
import { useNewFaultAlerts } from '../lib/useNewFaultAlerts'
import PushToggle from './PushToggle'
import FaultInbox from './FaultInbox'
import InstallPrompt from './InstallPrompt'
import { useLiveRefresh } from '../lib/live'

const NAV = [
  { to: '/admin', key: 'nav.dashboard', icon: LayoutGrid, end: true },
  { to: '/admin/kvarovi', key: 'nav.faults', icon: AlertTriangle, badge: true },
  { to: '/admin/oprema', key: 'nav.machines', icon: Factory },
  { to: '/admin/rezervni-dijelovi', key: 'nav.parts', icon: PackageSearch, divider: true },
  { to: '/admin/analize', key: 'nav.analytics', icon: BarChart3 },
  { to: '/admin/korisnici', key: 'nav.users', icon: Users, adminOnly: true },
]
// Overdue is time-driven as well as event-driven: a fault becomes late with nobody touching it.
const OVERDUE_POLL_MS = 60000
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')

/** Overdue faults, for the count beside "Faults" in the rail. */
function useOverdueCount() {
  const [count, setCount] = useState(0)
  const active = useRef(true)
  // One page of overdue faults is enough: the count comes back in X-Total-Count.
  const load = useCallback(() => api.get('/kvarovi?status=otvoreni&sla=kasni&limit=1')
    .then((response) => active.current && setCount(Number(response.headers['x-total-count']) || 0))
    .catch(() => {}), [])
  useLiveRefresh(load, (message) => message.action !== 'comment' && message.action !== 'photo')
  useEffect(() => {
    active.current = true
    load()
    const timer = window.setInterval(load, OVERDUE_POLL_MS)
    return () => {
      active.current = false
      window.clearInterval(timer)
    }
  }, [load])
  return count
}

function SearchTrigger({ onOpen }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-10 w-full items-center gap-2.5 rounded border border-white/15 bg-white/[0.06] px-3 text-sm text-brand-on-deep transition-colors hover:border-white/25 hover:text-stock"
    >
      <Search size={16} aria-hidden="true" />
      <span className="flex-1 text-left">{t('search.trigger')}</span>
      <kbd className="rounded-sm border border-white/15 px-1.5 py-0.5 text-[0.6875rem] font-semibold">{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
    </button>
  )
}

function ShellNav({ isAdmin, overdue, onNavigate }) {
  const { t } = useI18n()
  return (
    <nav aria-label={t('common.menu')} className="flex-1 px-3 py-3">
      {NAV.filter((item) => !item.adminOnly || isAdmin).map(({ to, key, icon: Icon, end, badge, divider }) => (
        <div key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `mb-0.5 flex min-h-[2.75rem] items-center gap-3 rounded px-3 text-[0.9375rem] font-medium transition-colors ${
                isActive ? 'bg-brand font-semibold text-stock shadow-label' : 'text-brand-on-deep hover:bg-white/10 hover:text-stock'
              }`
            }
          >
            <Icon size={18} aria-hidden="true" />
            {t(key)}
            {badge && overdue > 0 && (
              <span className="ml-auto rounded-sm bg-urgent px-1.5 py-0.5 numeral text-xs text-stock">
                {overdue}
                <span className="sr-only"> {t('nav.overdue')}</span>
              </span>
            )}
          </NavLink>
          {divider && <div className="mx-1 my-2.5 h-px bg-white/[0.08]" />}
        </div>
      ))}
    </nav>
  )
}

const tabClass = ({ isActive }) =>
  `relative flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${
    isActive ? 'text-brand' : 'text-ink-2 hover:text-ink'
  }`

/** Phones: the lead's daily destinations under the thumb; everything else stays in the menu. */
function TabBar({ overdue, onMenu, menuOpen }) {
  const { t } = useI18n()
  const { pathname } = useLocation()
  // Screens without their own tab (parts, analytics, users) live under "More".
  const elsewhere = !/^\/admin(\/?$|\/(kvarovi|oprema)(\/|$))/.test(pathname)
  return (
    <nav aria-label={t('nav.main')} className="pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-rule bg-stock/95 backdrop-blur-sm sm:hidden">
      <NavLink to="/admin" end className={tabClass}>
        <LayoutGrid size={21} aria-hidden="true" />
        {t('nav.dashboard')}
      </NavLink>
      <NavLink to="/admin/kvarovi" className={tabClass}>
        <AlertTriangle size={21} aria-hidden="true" />
        {t('nav.faults')}
        {overdue > 0 && (
          <span className="absolute left-1/2 top-1.5 ml-2 rounded-sm bg-urgent px-1 numeral text-[0.6875rem] text-stock">
            {overdue}
            <span className="sr-only"> {t('nav.overdue')}</span>
          </span>
        )}
      </NavLink>
      <NavLink to="/admin/oprema" className={tabClass}>
        <Factory size={21} aria-hidden="true" />
        {t('nav.machines')}
      </NavLink>
      <button type="button" onClick={onMenu} aria-expanded={menuOpen} className={tabClass({ isActive: elsewhere })}>
        <MoreHorizontal size={21} aria-hidden="true" />
        {t('nav.more')}
      </button>
    </nav>
  )
}

function Brand({ compact = false }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-3">
      <BrandLogo size="sm" />
      <div className="min-w-0">
        <p className="truncate font-semibold leading-tight text-stock">{t('app.name')}</p>
        {/* Phones: the app name alone; every pixel of height goes to the content. */}
        <p className={`text-meta leading-snug text-brand-on-deep ${compact ? 'hidden sm:block' : ''}`}>{t('app.tagline')}</p>
      </div>
    </div>
  )
}

function ShellBody({ isAdmin, overdue, onSearch, onNavigate, inbox }) {
  return (
    <>
      <div className="flex items-center gap-1 px-3 pt-1">
        <div className="min-w-0 flex-1"><SearchTrigger onOpen={onSearch} /></div>
        {inbox}
      </div>
      <ShellNav isAdmin={isAdmin} overdue={overdue} onNavigate={onNavigate} />
      <div className="border-t border-white/[0.08] p-2">
        <AccountMenu variant="rail">
          <PushToggle />
        </AccountMenu>
      </div>
    </>
  )
}

export default function AdminShell() {
  const { user } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const drawerRef = useRef(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const isAdmin = user?.rola === 'admin'
  const overdue = useOverdueCount()

  const inbox = useNewFaultAlerts(user)

  const openSearch = useCallback(() => {
    setDrawerOpen(false)
    setSearchOpen(true)
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const dialog = drawerRef.current
    if (!dialog) return
    if (drawerOpen && !dialog.open) dialog.showModal()
    if (!drawerOpen && dialog.open) dialog.close()
  }, [drawerOpen])

  useEffect(() => setDrawerOpen(false), [location.pathname])

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only z-[80] rounded bg-stock px-4 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {t('nav.skip')}
      </a>

      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col bg-brand-deep lg:flex">
        <div className="px-5 pb-4 pt-5"><Brand /></div>
        <ShellBody isAdmin={isAdmin} overdue={overdue} onSearch={openSearch} inbox={<FaultInbox inbox={inbox} align="left" />} />
      </aside>

      <header className="sticky top-0 z-40 flex items-center gap-2 bg-brand-deep px-2 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="btn-icon relative hidden h-11 w-11 text-stock hover:bg-white/10 hover:text-stock sm:inline-flex"
          aria-label={t('common.menu')}
          aria-expanded={drawerOpen}
        >
          <MenuIcon size={22} aria-hidden="true" />
          {overdue > 0 && <span aria-hidden="true" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-urgent ring-2 ring-brand-deep" />}
        </button>
        <div className="min-w-0 flex-1 pl-2 sm:pl-0"><Brand compact /></div>
        {scanSupported() && (
          <NavLink to="/admin/skeniraj" className="btn-icon h-11 w-11 text-stock hover:bg-white/10 hover:text-stock" aria-label={t('scan.headerButton')}>
            <QrCode size={20} aria-hidden="true" />
          </NavLink>
        )}
        <button type="button" onClick={openSearch} className="btn-icon h-11 w-11 text-stock hover:bg-white/10 hover:text-stock" aria-label={t('search.title')}>
          <Search size={20} aria-hidden="true" />
        </button>
        <FaultInbox inbox={inbox} />
      </header>

      <dialog
        ref={drawerRef}
        aria-label={t('common.menu')}
        onCancel={(event) => {
          event.preventDefault()
          setDrawerOpen(false)
        }}
        onMouseDown={(event) => {
          if (event.target === drawerRef.current) setDrawerOpen(false)
        }}
        className="m-0 h-dvh max-h-dvh w-[min(20rem,86vw)] max-w-none overflow-visible bg-brand-deep p-0 backdrop:bg-ink/45 lg:hidden"
      >
        {drawerOpen && (
          <div className="enter-fade flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-3">
              <Brand />
              <button type="button" onClick={() => setDrawerOpen(false)} className="btn-icon text-stock hover:bg-white/10 hover:text-stock" aria-label={t('common.close')}>
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <ShellBody isAdmin={isAdmin} overdue={overdue} onSearch={openSearch} onNavigate={() => setDrawerOpen(false)} />
          </div>
        )}
      </dialog>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <TabBar overdue={overdue} onMenu={() => setDrawerOpen(true)} menuOpen={drawerOpen} />
      <InstallPrompt />

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-28 pt-6 focus:outline-none sm:px-6 sm:pb-16 lg:px-8 lg:pt-7">
        <div className="mx-auto max-w-[76rem]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
