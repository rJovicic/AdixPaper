import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../i18n'
import { slaInfo } from '../lib/sla'
import { PriorityMark, PriorityTile, StatusMark, WaitingTag } from './ui/Marks'

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * "Danas 08:42", "Jučer 16:20", else the date: when it happened, as the floor says it.
 * `compact`: "08:42" today, "Jučer", else the day (narrow columns such as the activity feed).
 */
export function useReportedAt({ compact = false } = {}) {
  const { t, format } = useI18n()
  return (value) => {
    if (!value) return ''
    const date = new Date(value)
    const today = new Date()
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    if (sameDay(date, today)) return compact ? format.time(date) : `${t('time.today')} ${format.time(date)}`
    if (sameDay(date, yesterday)) return compact ? t('time.yesterday') : `${t('time.yesterday')} ${format.time(date)}`
    return compact ? format.dayMonth(date) : format.dateShort(date)
  }
}

/**
 * A fault as one compact row: the priority marker, the machine and number, what is wrong,
 * the priority and status pills, and when it was reported. `updated` flags a change the
 * reporter has not opened yet.
 */
export default function FaultRow({ fault, to, highlight = false, updated = false }) {
  const { t } = useI18n()
  const reportedAt = useReportedAt()
  const late = slaInfo(fault).state === 'late'
  const resolved = fault.status === 'Riješeno'
  return (
    <Link
      to={to}
      className={`group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-brand-wash/50 ${highlight ? 'bg-brand-wash/70' : ''}`}
    >
      <PriorityTile priority={fault.prioritet} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-semibold text-ink">{fault.oprema?.naziv || fault.naslov}</span>
          <span className="numeral shrink-0 text-meta text-ink-3">#{fault.id}</span>
          {updated && (
            <span className="ml-auto shrink-0 rounded-full bg-brand px-2 py-px text-[0.6875rem] font-bold text-stock">{t('worker.updated')}</span>
          )}
        </span>
        {fault.oprema?.naziv && <span className="mt-0.5 block truncate text-sm text-ink-2">{fault.naslov}</span>}
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          {!resolved && <PriorityMark priority={fault.prioritet} className="text-[0.75rem]" />}
          <StatusMark status={fault.status} className="text-[0.75rem]" />
          {late && <span className="text-[0.75rem] font-semibold text-urgent">{t('attention.kasniPlain')}</span>}
          <time dateTime={resolved ? fault.datum_rjesavanja : fault.datum_prijave} className="ml-auto whitespace-nowrap pl-2 text-meta text-ink-3">
            {reportedAt(resolved ? fault.datum_rjesavanja : fault.datum_prijave)}
          </time>
        </span>
        <WaitingTag fault={fault} className="mt-1.5 flex text-meta" />
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 self-center text-ink-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
