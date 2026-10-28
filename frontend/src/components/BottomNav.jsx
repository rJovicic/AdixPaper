import { NavLink } from 'react-router'
import { useI18n } from '../i18n'

const tabClass = ({ isActive }) =>
  `relative flex min-h-[3.5rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold transition-colors ${
    isActive ? 'text-brand' : 'text-ink-3 hover:text-ink'
  }`

/**
 * Phones and tablets: the daily destinations under the thumb, four at most, all the same weight.
 * `always`: also on wide screens (the worker app has no rail). An item's `count` shows as a small
 * red badge with its `countLabel` for screen readers.
 */
export default function BottomNav({ items, hidden = false, always = false }) {
  const { t } = useI18n()
  return (
    <nav hidden={hidden} aria-label={t('nav.main')} className={`pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-stock/95 backdrop-blur-sm ${always ? '' : 'lg:hidden'}`}>
      <div className="mx-auto flex max-w-xl items-stretch px-1">
        {items.map(({ to, label, icon: Icon, end, count, countLabel }) => (
          <NavLink key={to} to={to} end={end} className={tabClass}>
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
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
        ))}
      </div>
    </nav>
  )
}
