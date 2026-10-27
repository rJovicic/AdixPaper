import { Clock } from 'lucide-react'
import { useI18n } from '../../i18n'
import { slaInfo } from '../../lib/sla'

// Process inks carry state; every chip sits beside its word, so nothing is colour alone.
const STATUS_CHIP = {
  Novo: 'bg-cyan-mark',
  'U rješavanju': 'chip-yellow',
  'Na čekanju': 'chip-hollow',
  'Riješeno': 'bg-ok-mark',
}

const PRIORITY_MARK = {
  Hitno: { chip: 'bg-urgent-mark', text: 'font-semibold text-urgent' },
  Normalno: { chip: 'bg-key', text: 'text-ink' },
  Nisko: { chip: 'chip-hollow', text: 'text-ink-2' },
}

export function StatusMark({ status, className = '' }) {
  const { status: label } = useI18n()
  return (
    <span className={`inline-flex items-center gap-[7px] whitespace-nowrap text-sm text-ink ${className}`}>
      <i aria-hidden="true" className={`chip ${STATUS_CHIP[status] || 'bg-ink-3'}`} />
      {label(status)}
    </span>
  )
}

export function PriorityMark({ priority, className = '' }) {
  const { priority: label } = useI18n()
  const style = PRIORITY_MARK[priority] || PRIORITY_MARK.Normalno
  return (
    <span className={`inline-flex items-center gap-[7px] whitespace-nowrap text-sm ${style.text} ${className}`}>
      <i aria-hidden="true" className={`chip ${style.chip}`} />
      {label(priority)}
    </span>
  )
}

const STEPS = 12

/**
 * The signature: the response window as a press density strip. Steps fill as the window
 * is used, in cyan while on time, yellow from 75 %, magenta once overdue.
 * Decorative: the time text next to it carries the information.
 */
export function DueStrip({ fault, className = '' }) {
  const info = slaInfo(fault)
  if (info.state === 'none') return null
  const filled = Math.min(STEPS, Math.max(1, Math.ceil(info.ratio * STEPS)))
  return (
    <span aria-hidden="true" data-ink={info.state} className={`due-strip ${className}`}>
      {Array.from({ length: STEPS }, (_, index) => <i key={index} data-on={index < filled ? '' : undefined} />)}
    </span>
  )
}

/** Time left in the response window, or how late it is. Renders nothing for resolved faults. */
export function DueTag({ fault, className = '', wrap = false, icon = false }) {
  const { t, format } = useI18n()
  const info = slaInfo(fault)
  if (info.state === 'none') return null
  const tone = { late: 'font-semibold text-urgent', soon: 'font-semibold text-warn', ok: 'text-ink-2' }[info.state]
  const time = format.duration(Math.abs(info.minutesLeft))
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[0.8125rem] tabular ${wrap ? '' : 'whitespace-nowrap'} ${tone} ${className}`}>
      {icon && <Clock size={13} aria-hidden="true" className="shrink-0" />}
      {info.state === 'late' ? t('sla.overdue', { time }) : t('sla.left', { time })}
    </span>
  )
}

/** Time text over its density strip, for table cells and panels. */
export function Due({ fault, className = '' }) {
  if (slaInfo(fault).state === 'none') return null
  return (
    <span className={`grid min-w-[8.5rem] gap-1.5 ${className}`}>
      <DueTag fault={fault} />
      <DueStrip fault={fault} />
    </span>
  )
}

/** The fault number, set like a job number on a press sheet: mono, padded to three digits. */
export function FaultNumber({ id, size = 'md', className = '' }) {
  const sizes = { sm: 'text-[0.9375rem]', md: 'text-lg', lg: 'text-[2.25rem] leading-none' }
  const digits = String(id)
  const pad = digits.length < 3 ? '0'.repeat(3 - digits.length) : ''
  return (
    <span className={`numeral whitespace-nowrap text-ink ${sizes[size]} ${className}`}>
      <span className="sr-only">#</span>
      {pad && <span aria-hidden="true" className="font-medium text-ink-3">{pad}</span>}
      {digits}
    </span>
  )
}

/** Ruled label fields: small mono label over its value. */
export function LabelFields({ items, columns = 'sm:grid-cols-2 lg:grid-cols-4' }) {
  return (
    <dl className={`-mr-px grid grid-cols-2 border-t border-rule ${columns}`}>
      {items.filter(Boolean).map(({ label, value, wide }) => (
        <div key={label} className={`min-w-0 border-b border-r border-rule px-4 py-2.5 ${wide ? 'col-span-2' : ''}`}>
          <dt className="field-label">{label}</dt>
          <dd className="mt-0.5 break-words text-[0.9375rem] text-ink">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
