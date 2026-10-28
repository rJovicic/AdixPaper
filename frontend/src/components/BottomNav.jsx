import { NavLink } from 'react-router'
import { Plus } from 'lucide-react'
import { useI18n } from '../i18n'

const tabClass = ({ isActive }) =>
  `relative flex min-h-[3.5rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold transition-colors ${
    isActive ? 'text-brand' : 'text-ink-3 hover:text-ink'
  }`

/**
 * Phones and tablets: the daily destinations under the thumb, with "report a fault" as the raised
 * centre button (`always`: also on wide screens, for the worker app, which has no rail). `items` is up to four entries; the first two sit left of the button, the rest right of it.
 */
export default function BottomNav({ items, reportTo, hidden = false, always = false }) {
  const { t } = useI18n()
  const left = items.slice(0, 2)
  const right = items.slice(2)
  const tab = ({ to, label, icon: Icon, end, count, countLabel }) => (
    <NavLink key={to} to={to} end={end} className={tabClass}>
      {({ isActive }) => (
        <>
          <Icon size={22} strokeWidth={isActive ? 2.25 : 1.9} aria-hidden="true" />
          <span className="max-w-full truncate px-1">{label}</span>
          {count > 0 && (
            <span className="absolute left-1/2 top-1.5 ml-1.5 min-w-[1.125rem] rounded-full bg-urgent-mark px-1 text-center text-[0.6875rem] font-bold leading-[1.125rem] text-stock ring-2 ring-stock">
              {count > 99 ? '99+' : count}
              <span className="sr-only"> {countLabel}</span>
            </span>
          )}
        </>
      )}
    </NavLink>
  )
  return (
    <nav hidden={hidden} aria-label={t('nav.main')} className={`pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-stock/95 backdrop-blur-sm ${always ? '' : 'lg:hidden'}`}>
      <div className="mx-auto flex max-w-xl items-stretch px-1">
        {left.map(tab)}
        <div className="flex w-[4.5rem] shrink-0 justify-center">
          <NavLink
            to={reportTo}
            aria-label={t('nav.report')}
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-stock shadow-fab ring-4 ring-stock transition-colors hover:bg-brand-hover active:bg-brand-deep"
          >
            <Plus size={26} strokeWidth={2.5} aria-hidden="true" />
          </NavLink>
        </div>
        {right.map(tab)}
      </div>
    </nav>
  )
}
