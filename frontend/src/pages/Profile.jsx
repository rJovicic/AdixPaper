import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { BarChart3, ChevronRight, Download, Factory, KeyRound, Languages, LogOut, PackageSearch, Users, Wrench } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { displayName } from '../auth/session'
import { useI18n } from '../i18n'
import Avatar from '../components/ui/Avatar'
import LanguageSwitch from '../components/ui/LanguageSwitch'
import PushToggle from '../components/PushToggle'
import ChangePasswordDialog from '../components/ChangePasswordDialog'
import { useInstallAction } from '../components/InstallPrompt'

const rowClass = 'flex min-h-[3.25rem] w-full items-center gap-3 px-4 text-left text-[0.9375rem] font-medium text-ink transition-colors hover:bg-brand-wash/60'

function Section({ title, children }) {
  return (
    <section aria-label={title} className="surface overflow-hidden">
      <h2 className="px-4 pb-1 pt-3.5 text-meta font-semibold text-ink-3">{title}</h2>
      <div className="divide-y divide-rule">{children}</div>
    </section>
  )
}

function LinkRow({ to, icon: Icon, label }) {
  return (
    <Link to={to} className={rowClass}>
      <Icon size={19} aria-hidden="true" className="shrink-0 text-ink-2" />
      <span className="flex-1">{label}</span>
      <ChevronRight size={18} aria-hidden="true" className="text-ink-3" />
    </Link>
  )
}

/** The signed-in person: who they are, this device's settings, and (leads) the screens not on the tab bar. */
export default function Profile() {
  const { t, role } = useI18n()
  const { user, signOut } = useAuth()
  const [changingPassword, setChangingPassword] = useState(false)
  const install = useInstallAction()
  const lead = user?.rola === 'admin' || user?.rola === 'voditelj'

  useEffect(() => {
    document.title = `${t('profile.title')} · ${t('app.name')}`
  }, [t])

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="sr-only">{t('profile.title')}</h1>
      <section className="surface flex items-center gap-4 p-4 sm:p-5">
        <Avatar user={user} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold text-ink">{displayName(user)}</p>
          <p className="truncate text-ink-2">{role(user?.rola)} · {user?.username}</p>
        </div>
      </section>

      <Section title={t('profile.device')}>
        <div className={`${rowClass} hover:bg-transparent`}>
          <Languages size={19} aria-hidden="true" className="shrink-0 text-ink-2" />
          <span className="flex-1">{t('common.language')}</span>
          <LanguageSwitch />
        </div>
        <div className="px-1 py-1 empty:hidden">
          <PushToggle hint={lead ? t('inbox.pushHint') : t('worker.pushHint')} />
        </div>
        {install.visible && (
          <button type="button" className={rowClass} onClick={install.start}>
            <Download size={19} aria-hidden="true" className="shrink-0 text-ink-2" />
            <span className="flex-1">{t('install.menu')}</span>
          </button>
        )}
      </Section>

      {lead && (
        <Section title={t('profile.more')}>
          <LinkRow to="/admin/kvarovi" icon={Wrench} label={t('nav.faults')} />
          <LinkRow to="/admin/oprema" icon={Factory} label={t('nav.machines')} />
          <LinkRow to="/admin/rezervni-dijelovi" icon={PackageSearch} label={t('nav.parts')} />
          <LinkRow to="/admin/analize" icon={BarChart3} label={t('nav.analytics')} />
          {user?.rola === 'admin' && <LinkRow to="/admin/korisnici" icon={Users} label={t('nav.users')} />}
        </Section>
      )}

      <Section title={t('profile.account')}>
        <button type="button" className={rowClass} onClick={() => setChangingPassword(true)}>
          <KeyRound size={19} aria-hidden="true" className="shrink-0 text-ink-2" />
          <span className="flex-1">{t('account.changePassword')}</span>
        </button>
        <button type="button" className={`${rowClass} text-urgent hover:bg-urgent-wash`} onClick={() => signOut('signedOut')}>
          <LogOut size={19} aria-hidden="true" className="shrink-0" />
          <span className="flex-1">{t('common.signOut')}</span>
        </button>
      </Section>

      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
      {install.dialog}
    </div>
  )
}
