import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { AlertTriangle, BarChart3, Bell, BellOff, Factory, KeyRound, LayoutGrid, LogOut, Menu as MenuIcon, PackageSearch, Users, X } from 'lucide-react'
import BrandLogo from './BrandLogo'
import ChangePasswordDialog from './ChangePasswordDialog'
import LanguageSwitch from './ui/LanguageSwitch'
import { useAuth } from '../auth/AuthProvider'
import { displayName } from '../auth/session'
import { useI18n } from '../i18n'
import { useToast } from './ui/Toast'
import { useNewFaultAlerts } from '../lib/useNewFaultAlerts'
import { currentSubscription, disablePush, enablePush, getPushKey, pushSupported } from '../lib/push'

const NAV = [
  { to: '/admin', key: 'nav.dashboard', icon: LayoutGrid, end: true },
  { to: '/admin/kvarovi', key: 'nav.faults', icon: AlertTriangle },
  { to: '/admin/oprema', key: 'nav.machines', icon: Factory },
  { to: '/admin/rezervni-dijelovi', key: 'nav.parts', icon: PackageSearch },
  { to: '/admin/analize', key: 'nav.analytics', icon: BarChart3 },
  { to: '/admin/korisnici', key: 'nav.users', icon: Users, adminOnly: true },
]

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
      className="flex min-h-[2.75rem] w-full items-center gap-3 rounded px-3 text-sm font-medium text-brand-on-deep transition-colors hover:bg-white/10 hover:text-stock disabled:opacity-60"
    >
      <Icon size={18} aria-hidden="true" />
      {push.enabled ? t('notify.disable') : t('notify.enable')}
    </button>
  )
}

function ShellNav({ isAdmin, onNavigate }) {
  const { t } = useI18n()
  return (
    <nav aria-label={t('common.menu')} className="flex-1 space-y-1 px-3 py-4">
      {NAV.filter((item) => !item.adminOnly || isAdmin).map(({ to, key, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-[2.75rem] items-center gap-3 rounded px-3 text-[0.9375rem] font-medium transition-colors ${
              isActive ? 'bg-stock text-brand-deep shadow-label' : 'text-brand-on-deep hover:bg-white/10 hover:text-stock'
            }`
          }
        >
          <Icon size={19} aria-hidden="true" />
          {t(key)}
        </NavLink>
      ))}
    </nav>
  )
}

function ShellFooter() {
  const { t, role } = useI18n()
  const { user, signOut } = useAuth()
  const [changingPassword, setChangingPassword] = useState(false)
  return (
    <div className="space-y-3 border-t border-white/15 px-3 pb-4 pt-3">
      <PushToggle />
      <div className="flex items-center justify-between gap-2 px-3">
        <span className="text-sm text-brand-on-deep">{t('common.language')}</span>
        <LanguageSwitch tone="deep" />
      </div>
      <div className="rounded bg-white/[0.07] px-3 py-2.5">
        <p className="truncate font-semibold text-stock">{displayName(user)}</p>
        <p className="truncate text-sm text-brand-on-deep">{role(user?.rola)}</p>
      </div>
      <button
        type="button"
        onClick={() => setChangingPassword(true)}
        className="flex min-h-[2.75rem] w-full items-center gap-3 rounded px-3 text-sm font-medium text-brand-on-deep transition-colors hover:bg-white/10 hover:text-stock"
      >
        <KeyRound size={18} aria-hidden="true" />
        {t('account.changePassword')}
      </button>
      <button
        type="button"
        onClick={() => signOut('signedOut')}
        className="flex min-h-[2.75rem] w-full items-center gap-3 rounded px-3 text-sm font-medium text-brand-on-deep transition-colors hover:bg-white/10 hover:text-stock"
      >
        <LogOut size={18} aria-hidden="true" />
        {t('common.signOut')}
      </button>
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </div>
  )
}

function Brand() {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-3">
      <BrandLogo />
      <div className="min-w-0">
        <p className="font-semibold leading-tight text-stock">{t('app.name')}</p>
        <p className="text-meta leading-snug text-brand-on-deep">{t('app.tagline')}</p>
      </div>
    </div>
  )
}

export default function AdminShell() {
  const { user } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const drawerRef = useRef(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isAdmin = user?.rola === 'admin'

  useNewFaultAlerts(Boolean(user))

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

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-brand-deep lg:flex">
        <div className="border-b border-white/15 px-5 py-5"><Brand /></div>
        <ShellNav isAdmin={isAdmin} />
        <ShellFooter />
      </aside>

      <header className="sticky top-0 z-40 flex items-center gap-3 bg-brand-deep px-3 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="btn-icon text-stock hover:bg-white/10 hover:text-stock"
          aria-label={t('common.menu')}
          aria-expanded={drawerOpen}
        >
          <MenuIcon size={22} aria-hidden="true" />
        </button>
        <Brand />
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
        className="m-0 h-dvh max-h-dvh w-[min(20rem,86vw)] max-w-none bg-brand-deep p-0 backdrop:bg-ink/50 lg:hidden"
      >
        {drawerOpen && (
          <div className="enter-fade flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/15 px-4 py-3">
              <Brand />
              <button type="button" onClick={() => setDrawerOpen(false)} className="btn-icon text-stock hover:bg-white/10 hover:text-stock" aria-label={t('common.close')}>
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <ShellNav isAdmin={isAdmin} onNavigate={() => setDrawerOpen(false)} />
            <ShellFooter />
          </div>
        )}
      </dialog>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-16 pt-6 focus:outline-none sm:px-6 lg:px-10 lg:pt-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
