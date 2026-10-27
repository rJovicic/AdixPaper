import { Clock } from 'lucide-react'
import { useI18n } from '../../i18n'
import { slaInfo } from '../../lib/sla'

const STATUS_MARK = {
  Novo: 'bg-brand',
  'U rješavanju': 'bg-warn-mark',
  'Na čekanju': 'border-[1.5px] border-ink-3 bg-transparent',
  'Riješeno': 'bg-ok',
}

const PRIORITY_MARK = {
  Hitno: { mark: 'bg-urgent', text: 'font-semibold text-urgent' },
  Normalno: { mark: 'bg-ink-2', text: 'text-ink' },
  Nisko: { mark: 'border-[1.5px] border-ink-3 bg-transparent', text: 'text-ink-2' },
}

function Square({ className }) {
  return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] ${className}`} />
}

export function StatusMark({ status, className = '' }) {
  const { status: label } = useI18n()
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-ink ${className}`}>
      <Square className={STATUS_MARK[status] || 'bg-ink-3'} />
      {label(status)}
    </span>
  )
}

export function PriorityMark({ priority, className = '' }) {
  const { priority: label } = useI18n()
  const style = PRIORITY_MARK[priority] || PRIORITY_MARK.Normalno
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm ${style.text} ${className}`}>
      <Square className={style.mark} />
      {label(priority)}
    </span>
  )
}

/** Time left in the response window, or how late it is. Renders nothing for resolved faults. */
export function DueTag({ fault, className = '', wrap = false }) {
  const { t, format } = useI18n()
  const info = slaInfo(fault)
  if (info.state === 'none') return null
  const tone = { late: 'font-semibold text-urgent', soon: 'font-semibold text-warn', ok: 'text-ink-2' }[info.state]
  const time = format.duration(Math.abs(info.minutesLeft))
  return (
    <span className={`inline-flex items-center gap-1 ${wrap ? '' : 'whitespace-nowrap'} text-sm tabular ${tone} ${className}`}>
      <Clock size={14} aria-hidden="true" className="shrink-0" />
      {info.state === 'late' ? t('sla.overdue', { time }) : t('sla.left', { time })}
    </span>
  )
}

/** The fault number, set like the printed number on a reel label. */
export function FaultNumber({ id, size = 'md', className = '' }) {
  const sizes = { sm: 'text-lg', md: 'text-2xl', lg: 'text-[2.75rem] leading-none' }
  return (
    <span className={`numeral text-ink ${sizes[size]} ${className}`}>
      <span className="text-ink-3">#</span>{id}
    </span>
  )
}

/** Ruled label fields: small uppercase label over its value. */
export function LabelFields({ items, columns = 'sm:grid-cols-2 lg:grid-cols-4' }) {
  return (
    <dl className={`-mr-px grid grid-cols-2 border-t border-rule ${columns}`}>
      {items.filter(Boolean).map(({ label, value, wide }) => (
        <div key={label} className={`min-w-0 border-b border-r border-rule px-3 py-2.5 ${wide ? 'col-span-2' : ''}`}>
          <dt className="field-label">{label}</dt>
          <dd className="mt-0.5 break-words text-[0.9375rem] text-ink">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
