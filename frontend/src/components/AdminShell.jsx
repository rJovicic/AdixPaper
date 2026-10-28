import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { BarChart3, Factory, Home, PackageSearch, QrCode, Search, Settings, User, Users, Wrench } from 'lucide-react'
import { scanSupported } from '../lib/qr'
import { BrandOnNavy } from './BrandLogo'
import AccountMenu from './AccountMenu'
import SearchPalette from './SearchPalette'
import BottomNav from './BottomNav'
import Avatar from './ui/Avatar'
import LanguageSwitch from './ui/LanguageSwitch'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { displayName } from '../auth/session'
import { useI18n } from '../i18n'
import { useNewFaultAlerts } from '../lib/useNewFaultAlerts'
import PushToggle from './PushToggle'
import FaultInbox from './FaultInbox'
import InstallPrompt from './InstallPrompt'
import { useLiveRefresh } from '../lib/live'

const NAV = [
  { to: '/admin', key: 'nav.dashboard', icon: Home, end: true },
  { to: '/admin/kvarovi', key: 'nav.faults', icon: Wrench, badge: true },
  { to: '/admin/oprema', key: 'nav.machines', icon: Factory },
  { to: '/admin/rezervni-dijelovi', key: 'nav.parts', icon: PackageSearch },
  { to: '/admin/korisnici', key: 'nav.users', icon: Users, adminOnly: true },
  { to: '/admin/analize', key: 'nav.analytics', icon: BarChart3 },
  { to: '/admin/profil', key: 'nav.settings', icon: Settings },
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
      className="flex h-11 w-full max-w-[26rem] items-center gap-2.5 rounded border border-rule bg-ground/70 px-3.5 text-sm text-ink-3 transition-colors hover:border-rule-strong/60 hover:bg-stock hover:text-ink-2"
    >
      <Search size={17} aria-hidden="true" />
      <span className="flex-1 truncate text-left">{t('search.trigger')}</span>
      <kbd className="rounded-sm border border-rule bg-stock px-1.5 py-0.5 text-[0.6875rem] font-semibold text-ink-3">{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
    </button>
  )
}

function ShellNav({ isAdmin, overdue }) {
  const { t } = useI18n()
  return (
    <nav aria-label={t('common.menu')} className="flex-1 space-y-1 overflow-y-auto px-4 py-2">
      {NAV.filter((item) => !item.adminOnly || isAdmin).map(({ to, key, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex min-h-[2.875rem] items-center gap-3 rounded px-3.5 text-[0.9375rem] font-medium transition-colors ${
              isActive ? 'bg-brand font-semibold text-stock shadow-[0_6px_16px_-8px_rgb(31_86_208/0.9)]' : 'text-brand-on-deep hover:bg-white/[0.07] hover:text-stock'
            }`
          }
        >
          <Icon size={19} aria-hidden="true" />
          {t(key)}
          {badge && overdue > 0 && (
            <span className="ml-auto min-w-[1.375rem] rounded-full bg-urgent-mark px-1.5 text-center text-xs font-bold leading-[1.375rem] text-stock">
              {overdue}
              <span className="sr-only"> {t('nav.overdue')}</span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/** The signed-in person, as a round avatar that opens their profile and settings. */
function ProfileLink({ user, tone }) {
  const { t } = useI18n()
  return (
    <Link
      to="/admin/profil"
      aria-label={t('account.profileOf', { name: displayName(user) })}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${tone === 'navy' ? 'hover:bg-white/10' : 'hover:bg-ink/5'}`}
    >
      <Avatar user={user} tone={tone === 'navy' ? 'outline' : 'light'} />
    </Link>
  )
}

export default function AdminShell() {
  const { user } = useAuth()
  const { t } = useI18n()
  const { pathname } = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const isAdmin = user?.rola === 'admin'
  const overdue = useOverdueCount()
  const inbox = useNewFaultAlerts(user)
  const canScan = scanSupported()
  // On the report form and the scanner the bar would ride above the keyboard or the camera.
  const focused = /^\/admin\/(prijava|skeniraj)/.test(pathname)

  const openSearch = useCallback(() => setSearchOpen(true), [])

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

  const tabs = [
    { to: '/admin', label: t('nav.dashboard'), icon: Home, end: true },
    { to: '/admin/kvarovi', label: t('nav.faults'), icon: Wrench, count: overdue, countLabel: t('nav.overdue') },
    { to: '/admin/oprema', label: t('nav.machines'), icon: Factory },
    { to: '/admin/profil', label: t('nav.profile'), icon: User },
  ]

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only z-[80] rounded bg-stock px-4 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {t('nav.skip')}
      </a>

      <aside className="sticky top-0 hidden h-dvh w-[15.5rem] shrink-0 flex-col bg-brand-deep lg:flex">
        <Link to="/admin" className="mx-auto mb-6 mt-8 rounded px-3 py-1">
          <BrandOnNavy variant="rail" label={t('app.name')} />
        </Link>
        <ShellNav isAdmin={isAdmin} overdue={overdue} />
        <div className="border-t border-white/[0.08] p-3">
          <AccountMenu variant="rail">
            <PushToggle />
          </AccountMenu>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop: search, the bell, language and the person. */}
        <header className="sticky top-0 z-30 hidden h-[4.25rem] items-center gap-3 border-b border-rule bg-stock/90 px-8 backdrop-blur-sm lg:flex">
          <SearchTrigger onOpen={openSearch} />
          <div className="ml-auto flex items-center gap-2">
            <FaultInbox inbox={inbox} tone="light" />
            <LanguageSwitch />
            <ProfileLink user={user} tone="light" />
          </div>
        </header>

        {/* Phones and tablets: the navy bar, under the status bar of the installed app. */}
        <header className="pt-safe sticky top-0 z-40 bg-brand-deep lg:hidden">
          <div className="flex h-14 items-center gap-0.5 pl-4 pr-1.5">
            <Link to="/admin" className="min-w-0 flex-1 rounded py-2">
              <BrandOnNavy label={t('app.name')} />
            </Link>
            {canScan && (
              <NavLink to="/admin/skeniraj" className="btn-icon h-11 w-11 text-stock hover:bg-white/10 hover:text-stock" aria-label={t('scan.headerButton')}>
                <QrCode size={20} aria-hidden="true" />
              </NavLink>
            )}
            <button type="button" onClick={openSearch} className="btn-icon h-11 w-11 text-stock hover:bg-white/10 hover:text-stock" aria-label={t('search.title')}>
              <Search size={20} aria-hidden="true" />
            </button>
            <FaultInbox inbox={inbox} />
            <ProfileLink user={user} tone="navy" />
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className={`min-w-0 flex-1 px-4 pt-5 focus:outline-none sm:px-6 lg:px-8 lg:pb-12 lg:pt-7 ${focused ? 'pb-12' : 'pb-28'}`}
        >
          <div className="mx-auto max-w-[80rem]">
            <Outlet />
          </div>
        </main>
      </div>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <BottomNav items={tabs} reportTo="/admin/prijava" hidden={focused} />
      <InstallPrompt hidden={focused} />
    </div>
  )
}
