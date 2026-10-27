import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { AlertTriangle, BarChart3, Bell, BellOff, Factory, LayoutGrid, Menu as MenuIcon, PackageSearch, Search, Users, X } from 'lucide-react'
import BrandLogo from './BrandLogo'
import AccountMenu from './AccountMenu'
import SearchPalette from './SearchPalette'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../i18n'
import { useToast } from './ui/Toast'
import { useNewFaultAlerts } from '../lib/useNewFaultAlerts'
import { currentSubscription, disablePush, enablePush, getPushKey, pushSupported } from '../lib/push'

const NAV = [
  { to: '/admin', key: 'nav.dashboard', icon: LayoutGrid, end: true },
  { to: '/admin/kvarovi', key: 'nav.faults', icon: AlertTriangle, badge: true },
  { to: '/admin/oprema', key: 'nav.machines', icon: Factory },
  { to: '/admin/rezervni-dijelovi', key: 'nav.parts', icon: PackageSearch, divider: true },
  { to: '/admin/analize', key: 'nav.analytics', icon: BarChart3 },
  { to: '/admin/korisnici', key: 'nav.users', icon: Users, adminOnly: true },
]
const OVERDUE_POLL_MS = 60000
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')

/** Overdue faults, for the count beside "Faults" in the rail. */
function useOverdueCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let active = true
    const load = () => api.get('/dashboard/stats').then(({ data }) => active && setCount(data?.sla_kasni || 0)).catch(() => {})
    load()
    const timer = window.setInterval(load, OVERDUE_POLL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])
  return count
}

function usePushToggle() {
  const [state, setState] = useState({ available: false, enabled: false, busy: false, key: '' })

  useEffect(() => {
    if (!pushSupported()) return
    let active = true
    Promise.all([getPushKey().catch(() => ''), currentSubscription().catch(() => null)]).then(([key, subscription]) => {
      if (active) setState({ available: Boolean(key), enabled: Boolean(subscription), busy: false, key })
    })
    return () => { active = false }
  }, [])

  return [state, setState]
}

function PushToggle() {
  const { t } = useI18n()
  const toast = useToast()
  const [push, setPush] = usePushToggle()
  if (!push.available) return null

  const toggle = async () => {
    setPush((current) => ({ ...current, busy: true }))
    try {
      if (push.enabled) {
        await disablePush()
        setPush((current) => ({ ...current, enabled: false, busy: false }))
        toast.info(t('notify.off'))
      } else {
        await enablePush(push.key)
        setPush((current) => ({ ...current, enabled: true, busy: false }))
        toast.success(t('notify.on'))
      }
    } catch (error) {
      setPush((current) => ({ ...current, busy: false }))
      toast.error(error?.code === 'denied' ? t('notify.denied') : t('notify.failed'))
    }
  }

  const Icon = push.enabled ? BellOff : Bell
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={push.busy}
      aria-pressed={push.enabled}
      className="flex min-h-[2.75rem] w-full items-center gap-3 rounded px-3 text-left text-[0.9375rem] font-medium text-ink transition-colors hover:bg-brand-wash disabled:opacity-60"
    >
      <Icon size={17} aria-hidden="true" className="text-ink-2" />
      {push.enabled ? t('notify.disable') : t('notify.enable')}
    </button>
  )
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
                isActive ? 'bg-stock text-brand-deep shadow-label' : 'text-brand-on-deep hover:bg-white/10 hover:text-stock'
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

function Brand() {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-3">
      <BrandLogo size="sm" />
      <div className="min-w-0">
        <p className="font-semibold leading-tight text-stock">{t('app.name')}</p>
        <p className="text-meta leading-snug text-brand-on-deep">{t('app.tagline')}</p>
      </div>
    </div>
  )
}

function ShellBody({ isAdmin, overdue, onSearch, onNavigate }) {
  return (
    <>
      <div className="px-3 pt-1">
        <SearchTrigger onOpen={onSearch} />
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

  useNewFaultAlerts(Boolean(user))

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
        <ShellBody isAdmin={isAdmin} overdue={overdue} onSearch={openSearch} />
      </aside>

      <header className="sticky top-0 z-40 flex items-center gap-2 bg-brand-deep px-2 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="btn-icon relative h-11 w-11 text-stock hover:bg-white/10 hover:text-stock"
          aria-label={t('common.menu')}
          aria-expanded={drawerOpen}
        >
          <MenuIcon size={22} aria-hidden="true" />
          {overdue > 0 && <span aria-hidden="true" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-urgent ring-2 ring-brand-deep" />}
        </button>
        <div className="min-w-0 flex-1"><Brand /></div>
        <button type="button" onClick={openSearch} className="btn-icon h-11 w-11 text-stock hover:bg-white/10 hover:text-stock" aria-label={t('search.title')}>
          <Search size={20} aria-hidden="true" />
        </button>
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

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-16 pt-6 focus:outline-none sm:px-6 lg:px-8 lg:pt-7">
        <div className="mx-auto max-w-[76rem]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
