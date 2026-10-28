import { Link } from 'react-router'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useI18n } from '../../i18n'

// Quiet tiles: a pale wash with the icon in the tone's ink, so four cards read as one row, not four alarms.
const TILE = {
  info: 'bg-brand-wash text-brand',
  danger: 'bg-urgent-wash text-urgent',
  warning: 'bg-warn-wash text-warn',
  success: 'bg-ok-wash text-ok',
}

/**
 * The change since a reference point, coloured by whether it is good news: fewer open faults is
 * good (`better="down"`), more resolved is good (`better="up"`). The arrow is read out in words.
 */
export function Delta({ now, before, better = 'down', reference, className = '' }) {
  const { t } = useI18n()
  if (now === undefined || before === undefined) return null
  const change = now - before
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'same'
  const tone = direction === 'same' ? 'text-ink-3' : direction === better ? 'text-ok' : 'text-urgent'
  const Arrow = direction === 'up' ? ArrowUp : ArrowDown
  const words = direction === 'same' ? t('kpi.same') : t(direction === 'up' ? 'kpi.more' : 'kpi.fewer', { n: Math.abs(change) })
  return (
    <span className={`inline-flex items-center gap-0.5 text-[0.8125rem] font-semibold tabular ${tone} ${className}`}>
      {direction !== 'same' && <Arrow size={13} strokeWidth={2.5} aria-hidden="true" />}
      <span aria-hidden="true">{direction === 'same' ? '=' : Math.abs(change)}</span>
      <span className="sr-only">{words} {reference}</span>
    </span>
  )
}

/**
 * One key figure in a card: a small icon tile, the label, the number and its change.
 * The whole card opens the list behind the number. `inline`: icon beside the text at every width
 * (a full-width card); otherwise phones put the icon and label on one line over the number.
 */
export default function Kpi({ label, value, icon: Icon, tone = 'info', delta, reference, sub, to, loading = false, inline = false }) {
  const stack = inline ? 'contents' : 'flex items-start gap-2.5 sm:contents'
  const body = (
    <>
      <span className={stack}>
        <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md sm:h-10 sm:w-10 ${TILE[tone]}`}>
          <Icon size={18} strokeWidth={2} />
        </span>
        {!inline && <span className="line-clamp-2 pt-0.5 text-[0.8125rem] font-medium leading-snug text-ink-2 sm:hidden">{label}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`${inline ? 'block' : 'hidden sm:block'} truncate text-sm font-medium text-ink-2`}>{label}</span>
        <span className={`flex flex-wrap items-baseline gap-x-2.5 ${inline ? 'mt-0.5' : 'mt-2.5 justify-between sm:mt-1 sm:justify-start'}`}>
          <span className="numeral text-[1.5rem] leading-none text-ink sm:text-[1.75rem]">{loading ? '–' : value}</span>
          {!loading && delta}
        </span>
        <span className={`mt-1.5 ${inline ? 'block' : 'hidden sm:block'} truncate text-meta text-ink-3`}>{loading ? ' ' : (reference || sub || ' ')}</span>
      </span>
    </>
  )
  const className = `surface flex min-w-0 p-3.5 sm:gap-4 sm:p-5 ${inline ? 'flex-row items-center gap-3' : 'flex-col sm:flex-row'}`
  return to ? (
    <Link to={to} className={`${className} transition-[border-color,box-shadow] hover:border-rule-strong/50 hover:shadow-lift`}>{body}</Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
