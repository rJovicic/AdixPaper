import { Link } from 'react-router'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useI18n } from '../../i18n'

const TILE = {
  info: 'bg-brand',
  danger: 'bg-urgent-mark',
  warning: 'bg-warn-mark',
  success: 'bg-ok-mark',
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
    <span className={`inline-flex items-center gap-0.5 text-sm font-semibold tabular ${tone} ${className}`}>
      {direction !== 'same' && <Arrow size={14} strokeWidth={2.5} aria-hidden="true" />}
      <span aria-hidden="true">{direction === 'same' ? '=' : Math.abs(change)}</span>
      <span className="sr-only">{words} {reference}</span>
    </span>
  )
}

/**
 * One key figure in a card: a solid icon tile, the label, the number and its change.
 * The whole card opens the list behind the number.
 */
export default function Kpi({ label, value, icon: Icon, tone = 'info', delta, reference, sub, to, loading = false }) {
  // Phones: icon and label share the top line, the number sits under them (the reference line is read
  // out with the change, not shown). Wider: icon left, label, number and reference stacked beside it.
  const body = (
    <>
      <span className="flex items-start gap-2.5 sm:contents">
        <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-stock sm:h-12 sm:w-12 ${TILE[tone]}`}>
          <Icon size={19} strokeWidth={2.1} className="sm:h-[22px] sm:w-[22px]" />
        </span>
        <span className="line-clamp-2 pt-0.5 text-[0.8125rem] font-medium leading-snug text-ink-2 sm:hidden">{label}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="hidden truncate text-sm font-medium text-ink-2 sm:block">{label}</span>
        <span className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-2.5 sm:mt-1 sm:justify-start">
          <span className="numeral text-[1.5rem] leading-none text-ink sm:text-[1.75rem]">{loading ? '–' : value}</span>
          {!loading && delta}
        </span>
        <span className="mt-1.5 hidden truncate text-meta text-ink-3 sm:block">{loading ? '\u00a0' : (reference || sub || '\u00a0')}</span>
      </span>
    </>
  )
  const className = 'surface flex min-w-0 flex-col p-3.5 sm:flex-row sm:gap-4 sm:p-5'
  return to ? (
    <Link to={to} className={`${className} transition-[border-color,box-shadow] hover:border-rule-strong/50 hover:shadow-lift`}>{body}</Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
