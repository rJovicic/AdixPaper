import { AlertTriangle, ArrowDown, Check, Clock, Wrench } from 'lucide-react'
import { useI18n } from '../../i18n'
import { slaInfo } from '../../lib/sla'

/** Semantic tones: pill ground, border, text and dot. Every pair is >= 4.5:1 (DESIGN.md). */
export const TONES = {
  danger: { pill: 'bg-urgent-wash border-urgent/20 text-urgent', dot: 'bg-urgent-mark', text: 'text-urgent' },
  warning: { pill: 'bg-warn-wash border-warn-mark/30 text-warn', dot: 'bg-warn-mark', text: 'text-warn' },
  success: { pill: 'bg-ok-wash border-ok-mark/30 text-ok', dot: 'bg-ok-mark', text: 'text-ok' },
  info: { pill: 'bg-info-wash border-brand/20 text-brand', dot: 'bg-brand', text: 'text-brand' },
  new: { pill: 'bg-new-wash border-new-mark/25 text-new', dot: 'bg-new-mark', text: 'text-new' },
  neutral: { pill: 'bg-slate-wash border-slate-mark/40 text-slate', dot: 'bg-slate-mark', text: 'text-slate' },
}

const STATUS_TONE = { Novo: 'new', 'U rješavanju': 'info', 'Na čekanju': 'warning', 'Riješeno': 'success' }
const PRIORITY_TONE = { Hitno: 'danger', Normalno: 'warning', Nisko: 'neutral' }

/** A state pill: dot + word on a tinted ground. `hollow` draws an outlined dot (e.g. low priority, inactive). */
export function Badge({ tone = 'neutral', hollow = false, className = '', children }) {
  const style = TONES[tone] || TONES.neutral
  return (
    <span className={`badge ${style.pill} ${className}`}>
      <span aria-hidden="true" className={`dot ${hollow ? 'border border-current bg-transparent' : style.dot}`} />
      {children}
    </span>
  )
}

function Square({ className }) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`} />
}

export function StatusMark({ status, className = '' }) {
  const { status: label } = useI18n()
  return <Badge tone={STATUS_TONE[status]} className={className}>{label(status)}</Badge>
}

export function PriorityMark({ priority, className = '' }) {
  const { priority: label } = useI18n()
  return <Badge tone={PRIORITY_TONE[priority]} hollow={priority === 'Nisko'} className={className}>{label(priority)}</Badge>
}

const PRIORITY_TILE = {
  Hitno: { className: 'bg-urgent-wash text-urgent', icon: AlertTriangle },
  Normalno: { className: 'bg-warn-wash text-warn', icon: Wrench },
  Nisko: { className: 'bg-slate-wash text-slate', icon: ArrowDown },
}

/** The round priority marker that leads a fault row. Decorative: the priority pill beside it says it in words. */
export function PriorityTile({ priority, size = 'md', className = '' }) {
  const tile = PRIORITY_TILE[priority] || PRIORITY_TILE.Normalno
  const Icon = tile.icon
  const sizes = { sm: 'h-8 w-8', md: 'h-10 w-10' }
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full ${tile.className} ${sizes[size]} ${className}`}>
      <Icon size={size === 'sm' ? 16 : 18} strokeWidth={2} />
    </span>
  )
}

/** Time left to the first response, or how late it is. Renders nothing once someone has responded. */
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

/**
 * How the first response went, once there is one: "Responded on time" / "Responded late".
 * Nothing while waiting (DueTag speaks then) or when the record predates first responses.
 */
export function ResponseOutcome({ fault, className = '' }) {
  const { t } = useI18n()
  if (fault?.odziv_u_roku === null || fault?.odziv_u_roku === undefined) return null
  const late = fault.odziv_u_roku === false
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-sm ${late ? 'font-semibold text-urgent' : 'text-ink-2'} ${className}`}>
      {late ? <Clock size={14} aria-hidden="true" className="shrink-0" /> : <Check size={14} aria-hidden="true" className="shrink-0" />}
      {t(late ? 'sla.respondedLate' : 'sla.respondedOnTime')}
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
    <span aria-hidden="true" data-late={info.state === 'late' ? '' : undefined} data-soon={info.state === 'soon' ? '' : undefined} className={`due-bar ${className}`}>
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
  kasni: { mark: 'bg-urgent-mark', text: 'font-semibold text-urgent' },
  hitno: { mark: 'bg-urgent-mark', text: 'font-semibold text-urgent' },
  uskoro: { mark: 'bg-warn-mark', text: 'font-semibold text-warn' },
  nedodijeljen: { mark: 'bg-new-mark', text: 'font-semibold text-new' },
  ceka_dugo: { mark: 'bg-warn-mark', text: 'font-medium text-warn' },
}

function reasonText(reason, fault, i18n, now, withTime) {
  const { t, format } = i18n
  if (reason === 'kasni' && !withTime) return t('attention.kasniPlain')
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
/**
 * `withTime: false` where the time left is already shown next to it (overview queue, fault header):
 * overdue then reads "Response window passed" and due-soon is left to the time tag.
 */
export function AttentionReasons({ fault, max = 3, skip = [], withTime = true, className = '' }) {
  const i18n = useI18n()
  const now = Date.now()
  const info = slaInfo(fault, now)
  // The server's codes were right when the list loaded; time may have moved a fault from "soon" to "late".
  const reasons = (fault.razlozi_paznje || [])
    .map((reason) => (reason === 'uskoro' && info.state === 'late' ? 'kasni' : reason))
    .filter((reason) => !skip.includes(reason) && (withTime || reason !== 'uskoro'))
  if (reasons.length === 0) return null
  return (
    <ul className={`flex flex-wrap gap-x-3 gap-y-1 ${className}`}>
      {reasons.slice(0, max).map((reason) => {
        const tone = REASON_TONE[reason] || REASON_TONE.ceka_dugo
        return (
          <li key={reason} className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm ${tone.text}`}>
            <Square className={tone.mark} />
            {reasonText(reason, fault, i18n, now, withTime)}
          </li>
        )
      })}
    </ul>
  )
}

/** "Waiting: spare parts · 2 d" for faults on hold. Renders nothing otherwise. */
/** `compact`: reason only, one line (table cells). */
export function WaitingTag({ fault, compact = false, className = '' }) {
  const { t, format, waitingReason } = useI18n()
  if (fault?.status !== 'Na čekanju' || !fault.razlog_cekanja) return null
  const waited = fault.cekanje_od ? (Date.now() - new Date(fault.cekanje_od).getTime()) / 60000 : null
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm text-warn ${compact ? 'whitespace-nowrap' : ''} ${className}`}>
      <Square className="bg-warn-mark" />
      {compact ? waitingReason(fault.razlog_cekanja) : t('waiting.waitingFor', { reason: waitingReason(fault.razlog_cekanja) })}
      {!compact && waited !== null && <span className="tabular text-ink-3">· {format.duration(waited)}</span>}
    </span>
  )
}
