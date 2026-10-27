import { useEffect, useId, useRef, useState } from 'react'
import { ChevronUp, KeyRound, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { displayName } from '../auth/session'
import { useI18n } from '../i18n'
import ChangePasswordDialog from './ChangePasswordDialog'
import LanguageSwitch from './ui/LanguageSwitch'

export function initials(user) {
  const letters = `${user?.ime?.[0] || ''}${user?.prezime?.[0] || ''}`.trim()
  return (letters || user?.username?.[0] || '?').toUpperCase()
}

const itemClass = 'flex min-h-[2.75rem] w-full items-center gap-3 rounded px-3 text-left text-[0.9375rem] font-medium text-ink transition-colors hover:bg-brand-wash focus-visible:bg-brand-wash'

/**
 * The signed-in person: language, password and sign-out in one place.
 * `variant="rail"` is the full-width account row at the foot of the lead rail (opens upwards);
 * `variant="bar"` is the avatar button in the worker's top bar (opens downwards).
 * A disclosure, not an ARIA menu, because it mixes a language switch with actions.
 */
export default function AccountMenu({ variant = 'bar', children }) {
  const { t, role } = useI18n()
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const panelId = useId()
  const name = displayName(user)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const rail = variant === 'rail'
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={rail ? undefined : t('account.menu', { name })}
        onClick={() => setOpen((value) => !value)}
        className={rail
          ? 'flex w-full items-center gap-3 rounded px-2.5 py-2 text-left transition-colors hover:bg-key-2 aria-expanded:bg-key-2'
          : 'flex h-11 w-11 items-center justify-center rounded transition-colors hover:bg-key-2'}
      >
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-stock font-mono text-xs font-semibold text-key">
          {initials(user)}
        </span>
        {rail && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-stock">{name}</span>
              <span className="block truncate text-meta text-brand-on-deep">{role(user?.rola)}</span>
            </span>
            <ChevronUp size={16} aria-hidden="true" className={`shrink-0 text-brand-on-deep transition-transform ${open ? '' : 'rotate-180'}`} />
          </>
        )}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className={`enter-fade absolute z-50 w-72 rounded-lg border border-rule bg-stock p-1.5 text-ink shadow-lift
          ${rail ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'}`}
      >
        <div className="border-b border-rule px-3 pb-2.5 pt-2">
          <p className="truncate font-semibold">{name}</p>
          <p className="truncate text-meta text-ink-2">{role(user?.rola)}</p>
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-sm text-ink-2">{t('common.language')}</span>
          <LanguageSwitch />
        </div>
        {children}
        <button
          type="button"
          className={itemClass}
          onClick={() => {
            setOpen(false)
            setChangingPassword(true)
          }}
        >
          <KeyRound size={17} aria-hidden="true" className="text-ink-2" />
          {t('account.changePassword')}
        </button>
        <button type="button" className={itemClass} onClick={() => signOut('signedOut')}>
          <LogOut size={17} aria-hidden="true" className="text-ink-2" />
          {t('common.signOut')}
        </button>
      </div>
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </div>
  )
}
