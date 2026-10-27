import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../i18n'
import { slaInfo } from '../lib/sla'
import { DueStrip, DueTag, FaultNumber, PriorityMark, StatusMark } from './ui/Marks'

/** A fault on a phone: its due strip across the top edge, number and title, state, and who has it. */
export default function FaultCard({ fault, to, highlight = false }) {
  const { t, format } = useI18n()
  const resolved = fault.status === 'Riješeno'
  const late = slaInfo(fault).state === 'late'
  const place = [fault.oprema?.naziv, fault.komponenta?.naziv].filter(Boolean).join(' · ')
  const owner = fault.voditelj ? `${fault.voditelj.ime} ${fault.voditelj.prezime}` : null
  return (
    <Link
      to={to}
      className={`surface group block overflow-hidden transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-lift
        ${late ? 'border-urgent-mark/40' : ''} ${highlight ? 'ring-2 ring-brand ring-offset-2 ring-offset-ground' : ''}`}
    >
      {!resolved && <DueStrip fault={fault} className="h-[7px] [&>i]:rounded-none" />}
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <FaultNumber id={fault.id} size="md" className="shrink-0 pt-px" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-ink">{fault.naslov}</p>
          {place && <p className="mt-0.5 truncate text-ink-2">{place}</p>}
        </div>
        <ChevronRight size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pb-3">
        <StatusMark status={fault.status} />
        {resolved ? (
          <span className="ml-auto font-mono text-[0.8125rem] text-ink-2">
            <span className="sr-only">{t('fault.resolvedAt')}: </span>{format.dateShort(fault.datum_rjesavanja)}
          </span>
        ) : (
          <>
            <PriorityMark priority={fault.prioritet} />
            <DueTag fault={fault} wrap className="ml-auto" />
          </>
        )}
      </div>
      {!resolved && (
        <p className={`flex items-center gap-2 border-t border-rule px-4 py-2.5 text-meta text-ink-2 ${late ? 'bg-urgent-wash' : ''}`}>
          <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-[0.625rem] font-semibold ${owner ? 'bg-key text-stock' : 'text-ink-3 shadow-[inset_0_0_0_1.5px_rgb(var(--rule-strong))]'}`}>
            {owner ? `${fault.voditelj.ime[0] || ''}${fault.voditelj.prezime[0] || ''}` : '–'}
          </span>
          {owner ? t('worker.handledBy', { name: owner }) : t('worker.waiting')}
        </p>
      )}
    </Link>
  )
}
