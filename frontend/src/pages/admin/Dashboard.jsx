import { useEffect, useMemo } from 'react'
import { Link } from 'react-router'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { byRisk, OPEN_STATUSES } from '../../lib/sla'
import { useI18n } from '../../i18n'
import { DueTag, FaultNumber, PriorityMark, StatusMark } from '../../components/ui/Marks'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../../components/ui/States'

const get = (path) => api.get(path).then((response) => response.data)

function Figure({ label, value, to, alert = false, loading }) {
  return (
    <Link to={to} className="group flex flex-col justify-between gap-3 border-b border-r border-rule px-4 py-4 transition-colors hover:bg-brand-wash/60 sm:px-5">
      <span className="field-label">{label}</span>
      <span className="flex items-end justify-between gap-2">
        <span className={`numeral text-figure ${alert && value > 0 ? 'text-urgent' : 'text-ink'}`}>{loading ? '–' : value}</span>
        <ArrowRight size={18} aria-hidden="true" className="mb-1 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </span>
    </Link>
  )
}

export default function Dashboard() {
  const { t, format } = useI18n()
  const stats = useAsync(() => get('/dashboard/stats'), [])
  const faults = useAsync(() => get('/kvarovi').then(asArray), [])

  useEffect(() => {
    document.title = `${t('dashboard.title')} · ${t('app.name')}`
  }, [t])

  const attention = useMemo(
    () => (faults.data || []).filter((fault) => OPEN_STATUSES.includes(fault.status)).sort(byRisk).slice(0, 10),
    [faults.data],
  )

  const s = stats.data
  const loadingStats = stats.loading && !s

  return (
    <div>
      <PageHeader title={t('dashboard.title')} meta={format.dateLong(new Date())} />

      {stats.error ? (
        <div className="surface mb-6"><ErrorState error={stats.error} onRetry={stats.reload} /></div>
      ) : (
        <nav aria-label={t('dashboard.title')} className="surface mb-6 grid grid-cols-3 overflow-hidden border-b-0 border-r-0">
          <Figure label={t('dashboard.open')} value={s?.otvoreni_kvarovi ?? 0} loading={loadingStats} to="/admin/kvarovi?status=otvoreni" />
          <Figure label={t('dashboard.urgent')} value={s?.hitni_kvarovi ?? 0} loading={loadingStats} alert to="/admin/kvarovi?status=otvoreni&prioritet=Hitno" />
          <Figure label={t('dashboard.overdue')} value={s?.sla_kasni ?? 0} loading={loadingStats} alert to="/admin/kvarovi?sla=kasni" />
        </nav>
      )}

      <section aria-labelledby="attention-title" className="surface">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b border-rule px-5 py-3.5">
          <div>
            <h2 id="attention-title" className="text-lg font-semibold">{t('dashboard.attention')}</h2>
            <p className="text-meta text-ink-2">{t('dashboard.attentionHint')}</p>
          </div>
          <Link to="/admin/kvarovi?status=otvoreni&sort=rizik" className="link inline-flex items-center gap-1 text-sm">
            {t('dashboard.allOpen')} <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </header>
        {faults.loading && !faults.data ? (
          <LoadingRows rows={4} />
        ) : faults.error ? (
          <ErrorState error={faults.error} onRetry={faults.reload} />
        ) : attention.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={t('dashboard.attentionEmpty')} />
        ) : (
          <ul className="divide-y divide-rule">
            {attention.map((fault) => (
              <li key={fault.id}>
                <Link
                  to={`/admin/kvarovi/${fault.id}`}
                  className="grid grid-cols-[3.5rem_1fr] items-start gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-brand-wash/50 md:grid-cols-[3.5rem_minmax(0,1fr)_6.5rem_8rem_8.5rem_9rem] md:items-center"
                >
                  <FaultNumber id={fault.id} size="sm" className="pt-0.5 md:pt-0" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{fault.naslov}</span>
                    <span className="block truncate text-meta text-ink-2">
                      {[fault.oprema?.naziv, fault.komponenta?.naziv].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="col-start-2 flex flex-wrap gap-x-4 gap-y-1 md:contents">
                    <PriorityMark priority={fault.prioritet} />
                    <DueTag fault={fault} />
                    <StatusMark status={fault.status} />
                    <span className="truncate text-sm text-ink-2">
                      {fault.voditelj ? `${fault.voditelj.ime} ${fault.voditelj.prezime}` : <span className="text-ink-3">{t('fault.unassigned')}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  )
}
