import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Bell, CheckCheck } from 'lucide-react'
import { useI18n } from '../i18n'
import { PriorityMark } from './ui/Marks'
import PushToggle from './PushToggle'

/**
 * The bell: newly reported faults with an unread count. `tone` matches where it sits
 * (the navy rail/header or a light surface).
 */
export default function FaultInbox({ inbox, tone = 'dark', align = 'right' }) {
  const { t, format } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const panelId = useId()
  const { items, unread, seen, markRead } = inbox

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

  const label = unread > 0 ? t('inbox.labelUnread', { n: unread }) : t('inbox.label')
  const buttonTone = tone === 'dark' ? 'text-stock hover:bg-white/10 hover:text-stock' : 'text-ink-2 hover:bg-ink/5 hover:text-ink'

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={`btn-icon relative h-11 w-11 ${buttonTone}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && (
          <span aria-hidden="true" className={`absolute right-1 top-1 min-w-[1.125rem] rounded-full bg-urgent-mark px-1 text-center text-[0.6875rem] font-bold leading-[1.125rem] text-stock ring-2 ${tone === 'dark' ? 'ring-brand-deep' : 'ring-stock'}`}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={t('inbox.title')}
          className={`enter-fade fixed inset-x-2 top-[calc(3.75rem+env(safe-area-inset-top))] z-50 max-h-[min(32rem,75dvh)] overflow-y-auto rounded-lg border border-rule bg-stock text-ink shadow-dialog sm:absolute sm:inset-x-auto sm:top-12 sm:w-[22rem] ${align === 'left' ? 'sm:left-0' : 'sm:right-0'}`}
        >
          <div className="sticky top-0 flex items-center gap-2 border-b border-rule bg-stock px-4 py-3">
            <h2 className="flex-1 font-semibold">{t('inbox.title')}</h2>
            {unread > 0 && (
              <button type="button" className="btn-quiet -mr-2 text-sm" onClick={() => markRead()}>
                <CheckCheck size={16} aria-hidden="true" /> {t('inbox.markRead')}
              </button>
            )}
          </div>
          <div className="border-b border-rule p-3 empty:hidden">
            <PushToggle variant="card" hint={t('inbox.pushHint')} />
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-ink-2">{t('inbox.empty')}</p>
          ) : (
            <ul className="divide-y divide-rule">
              {items.map((fault) => {
                const isUnread = fault.id > seen
                return (
                  <li key={fault.id}>
                    <Link
                      to={`/admin/kvarovi/${fault.id}`}
                      onClick={() => {
                        markRead(fault.id)
                        setOpen(false)
                      }}
                      className={`flex gap-3 px-4 py-3 transition-colors hover:bg-brand-wash/60 ${isUnread ? 'bg-info-wash/40' : ''}`}
                    >
                      <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 rounded-full ${isUnread ? 'bg-brand' : 'bg-transparent'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {isUnread && <span className="sr-only">{t('inbox.unread')}: </span>}
                          {fault.naslov}
                        </span>
                        <span className="block truncate text-meta text-ink-2">
                          #{fault.id} · {fault.oprema?.naziv || '—'} · {format.ago(fault.datum_prijave)}
                        </span>
                        <PriorityMark priority={fault.prioritet} className="mt-1 text-meta" />
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="border-t border-rule px-4 py-2.5">
            <Link to="/admin/kvarovi" onClick={() => setOpen(false)} className="link text-sm">{t('inbox.all')}</Link>
          </div>
          {/* Asked here, where it is wanted, never on page load. Hidden when the server has no push keys. */}
          <div className="border-t border-rule px-1.5 py-1.5 empty:hidden">
            <PushToggle variant="manage" />
          </div>
        </div>
      )}
    </div>
  )
}
