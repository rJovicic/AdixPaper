import { Clock } from 'lucide-react'
import { useI18n } from '../../i18n'
import { slaInfo } from '../../lib/sla'

const STATUS_MARK = {
  Novo: 'bg-brand',
  'U rješavanju': 'mark-half',
  'Na čekanju': 'border-[1.5px] border-ink-3 bg-transparent',
  'Riješeno': 'bg-grey',
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

/** How much of the response window is used: a hairline under the time. Decorative; the time text carries it. */
export function DueBar({ fault, className = '' }) {
  const info = slaInfo(fault)
  if (info.state === 'none') return null
  const used = Math.min(100, Math.max(3, Math.round(info.ratio * 100)))
  return (
    <span aria-hidden="true" data-late={info.state === 'late' ? '' : undefined} className={`due-bar ${className}`}>
      <i style={{ width: `${used}%` }} />
    </span>
  )
}

/** Time left over its hairline, for overview rows and panels. */
export function Due({ fault, className = '' }) {
  if (slaInfo(fault).state === 'none') return null
  return (
    <span className={`grid gap-1.5 ${className}`}>
      <DueTag fault={fault} />
      <DueBar fault={fault} />
    </span>
  )
}

const REASON_TONE = {
  kasni: { mark: 'bg-urgent', text: 'font-semibold text-urgent' },
  hitno: { mark: 'bg-urgent', text: 'font-semibold text-urgent' },
  uskoro: { mark: 'mark-half', text: 'font-semibold text-warn' },
  nedodijeljen: { mark: 'border-[1.5px] border-brand bg-transparent', text: 'font-semibold text-warn' },
  ceka_dugo: { mark: 'border-[1.5px] border-ink-3 bg-transparent', text: 'font-medium text-ink-2' },
}

function reasonText(reason, fault, i18n, now) {
  const { t, format } = i18n
  if (reason === 'kasni' || reason === 'uskoro') {
    const info = slaInfo(fault, now)
    return t(`attention.${reason}`, { time: format.duration(Math.abs(info.minutesLeft ?? 0)) })
  }
  if (reason === 'ceka_dugo') {
    const waited = fault.cekanje_od ? (now - new Date(fault.cekanje_od).getTime()) / 60000 : 0
    const text = t('attention.ceka_dugo', { time: format.duration(waited) })
    return fault.razlog_cekanja ? `${text} · ${i18n.waitingReason(fault.razlog_cekanja)}` : text
  }
  return t(`attention.${reason}`)
}

/**
 * Why a fault needs attention, in words (server codes in `fault.razlozi_paznje`, most pressing
 * first). Overdue/due-soon are recomputed from the clock so the times stay current.
 */
export function AttentionReasons({ fault, max = 3, skip = [], className = '' }) {
  const i18n = useI18n()
  const now = Date.now()
  const info = slaInfo(fault, now)
  // The server's codes were right when the list loaded; time may have moved a fault from "soon" to "late".
  const reasons = (fault.razlozi_paznje || [])
    .map((reason) => (reason === 'uskoro' && info.state === 'late' ? 'kasni' : reason))
    .filter((reason) => !skip.includes(reason))
  if (reasons.length === 0) return null
  return (
    <ul className={`flex flex-wrap gap-x-3 gap-y-1 ${className}`}>
      {reasons.slice(0, max).map((reason) => {
        const tone = REASON_TONE[reason] || REASON_TONE.ceka_dugo
        return (
          <li key={reason} className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm ${tone.text}`}>
            <Square className={tone.mark} />
            {reasonText(reason, fault, i18n, now)}
          </li>
        )
      })}
    </ul>
  )
}

/** "Waiting: spare parts · 2 d" for faults on hold. Renders nothing otherwise. */
export function WaitingTag({ fault, className = '' }) {
  const { t, format, waitingReason } = useI18n()
  if (fault?.status !== 'Na čekanju' || !fault.razlog_cekanja) return null
  const waited = fault.cekanje_od ? (Date.now() - new Date(fault.cekanje_od).getTime()) / 60000 : null
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm text-ink-2 ${className}`}>
      <Square className="border-[1.5px] border-ink-3 bg-transparent" />
      {t('waiting.waitingFor', { reason: waitingReason(fault.razlog_cekanja) })}
      {waited !== null && <span className="tabular text-ink-3">· {format.duration(waited)}</span>}
    </span>
  )
}
