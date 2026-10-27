import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../i18n'
import { slaInfo } from '../lib/sla'
import { DueTag, FaultNumber, PriorityMark, StatusMark } from './ui/Marks'

function Cell({ label, children, wrap = false }) {
  return (
    <div className="min-w-0 border-r border-rule px-3 py-2 last:border-r-0">
      <p className="field-label">{label}</p>
      <div className={`mt-0.5 ${wrap ? 'break-words' : 'truncate'}`}>{children}</div>
    </div>
  )
}

/** A fault as a reel label: big number, what is wrong, then ruled fields for where it stands. */
export default function FaultCard({ fault, to, highlight = false }) {
  const { t, format } = useI18n()
  const resolved = fault.status === 'Riješeno'
  const late = slaInfo(fault).state === 'late'
  const place = [fault.oprema?.naziv, fault.komponenta?.naziv].filter(Boolean).join(' · ')
  return (
    <Link
      to={to}
      className={`surface group block overflow-hidden transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-lift
        ${late ? 'border-urgent/50' : ''} ${highlight ? 'ring-2 ring-brand ring-offset-2 ring-offset-ground' : ''}`}
    >
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <FaultNumber id={fault.id} size="md" className="shrink-0 pt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-ink">{fault.naslov}</p>
          {place && <p className="mt-0.5 truncate text-ink-2">{place}</p>}
        </div>
        <ChevronRight size={20} aria-hidden="true" className="mt-1 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className={`grid border-t border-rule ${resolved ? 'grid-cols-2' : 'grid-cols-3'} ${late ? 'bg-urgent-wash/60' : 'bg-ground/40'}`}>
        <Cell label={t('fault.status')}><StatusMark status={fault.status} /></Cell>
        {resolved ? (
          <Cell label={t('fault.resolvedAt')}><span className="text-sm tabular text-ink">{format.dateShort(fault.datum_rjesavanja)}</span></Cell>
        ) : (
          <>
            <Cell label={t('fault.priority')}><PriorityMark priority={fault.prioritet} /></Cell>
            {/* "još 1 h 58 min" does not fit a third of a 390 px card; wrap instead of clipping. */}
            <Cell label={t('fault.due')} wrap><DueTag fault={fault} wrap /></Cell>
          </>
        )}
      </div>
      {!resolved && (
        <p className="border-t border-rule px-4 py-2 text-meta text-ink-2">
          {fault.voditelj ? t('worker.handledBy', { name: `${fault.voditelj.ime} ${fault.voditelj.prezime}` }) : t('worker.waiting')}
        </p>
      )}
    </Link>
  )
}
