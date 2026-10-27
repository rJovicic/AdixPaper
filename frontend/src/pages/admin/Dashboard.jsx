import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, CheckCircle2, Inbox } from 'lucide-react'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { byRisk, OPEN_STATUSES } from '../../lib/sla'
import { useI18n } from '../../i18n'
import { useAuth } from '../../auth/AuthProvider'
import { Due, FaultNumber, PriorityMark, StatusMark } from '../../components/ui/Marks'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../../components/ui/States'

const get = (path) => api.get(path).then((response) => response.data)
const ATTENTION_ROWS = 10
const ROW_COLUMNS = 'md:grid-cols-[3.5rem_minmax(0,1fr)_6.5rem_9rem_9rem]'

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

function AttentionRow({ fault, unassigned }) {
  return (
    <li>
      <Link
        to={`/admin/kvarovi/${fault.id}`}
        className={`grid grid-cols-[3.5rem_1fr] items-start gap-x-3 gap-y-2 px-5 py-3 transition-colors hover:bg-brand-wash/50 ${ROW_COLUMNS} md:items-center`}
      >
        <FaultNumber id={fault.id} size="sm" className="pt-0.5 md:pt-0" />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink">{fault.naslov}</span>
          <span className="block truncate text-meta text-ink-2">{[fault.oprema?.naziv, fault.komponenta?.naziv].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="col-start-2 flex flex-wrap items-center gap-x-4 gap-y-2 md:contents">
          <PriorityMark priority={fault.prioritet} />
          <span className="flex min-w-0 items-center gap-x-4 md:order-last md:grid md:gap-0.5">
            <StatusMark status={fault.status} />
            <span className="truncate text-meta text-ink-2">
              {fault.voditelj ? `${fault.voditelj.ime} ${fault.voditelj.prezime}` : <span className="text-ink-3">{unassigned}</span>}
            </span>
          </span>
          <Due fault={fault} className="w-full md:w-auto" />
        </span>
      </Link>
    </li>
  )
}

export default function Dashboard() {
  const { t, format } = useI18n()
  const { user } = useAuth()
  const [tab, setTab] = useState('all')
  const stats = useAsync(() => get('/dashboard/stats'), [])
  const faults = useAsync(() => get('/kvarovi?status=otvoreni').then(asArray), [])

  useEffect(() => {
    document.title = `${t('dashboard.title')} · ${t('app.name')}`
  }, [t])

  const open = useMemo(() => [...(faults.data || [])].filter((fault) => OPEN_STATUSES.includes(fault.status)).sort(byRisk), [faults.data])
  const unassigned = useMemo(() => open.filter((fault) => !fault.voditelj_id), [open])
  const mine = useMemo(() => open.filter((fault) => String(fault.voditelj_id) === String(user?.id)), [open, user?.id])
  const tabs = [
    { id: 'all', label: t('dashboard.tabAll'), list: open },
    { id: 'unassigned', label: t('dashboard.tabUnassigned'), list: unassigned },
    { id: 'mine', label: t('dashboard.tabMine'), list: mine },
  ]
  const shown = (tabs.find((item) => item.id === tab) || tabs[0]).list.slice(0, ATTENTION_ROWS)

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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
        <section aria-labelledby="attention-title" className="surface min-w-0">
          <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule px-5 py-3.5">
            <h2 id="attention-title" className="text-lg font-semibold">{t('dashboard.attention')}</h2>
            <div role="group" aria-label={t('dashboard.attentionFilter')} className="flex gap-1">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={`inline-flex min-h-[2.25rem] items-center gap-1.5 rounded px-3 text-sm font-semibold transition-colors ${
                    tab === item.id ? 'bg-brand-wash text-brand-deep' : 'text-ink-2 hover:bg-ink/5 hover:text-ink'
                  }`}
                >
                  {item.label}
                  <span className="tabular font-medium text-ink-3">{faults.data ? item.list.length : '·'}</span>
                </button>
              ))}
            </div>
            <Link to="/admin/kvarovi?status=otvoreni&sort=rizik" className="link ml-auto inline-flex items-center gap-1 text-sm">
              {t('dashboard.allOpen')} <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </header>
          {faults.loading && !faults.data ? (
            <LoadingRows rows={4} />
          ) : faults.error ? (
            <ErrorState error={faults.error} onRetry={faults.reload} />
          ) : shown.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={tab === 'all' ? t('dashboard.attentionEmpty') : t('dashboard.tabEmpty')} />
          ) : (
            <ul className="divide-y divide-rule">
              {shown.map((fault) => <AttentionRow key={fault.id} fault={fault} unassigned={t('fault.unassigned')} />)}
            </ul>
          )}
        </section>

        <section aria-labelledby="mine-title" className="surface">
          <header className="flex items-center justify-between border-b border-rule px-5 py-3.5">
            <h2 id="mine-title" className="text-lg font-semibold">{t('dashboard.mine')}</h2>
            <span className="numeral text-lg text-ink-3">{faults.data ? mine.length : ''}</span>
          </header>
          {faults.loading && !faults.data ? (
            <LoadingRows rows={2} />
          ) : mine.length === 0 ? (
            <EmptyState icon={Inbox} title={t('dashboard.mineEmpty')} body={unassigned.length ? t('dashboard.mineEmptyBody', { n: unassigned.length }) : undefined} className="py-8" />
          ) : (
            <ul className="divide-y divide-rule">
              {mine.slice(0, 6).map((fault) => (
                <li key={fault.id}>
                  <Link to={`/admin/kvarovi/${fault.id}`} className="grid gap-2 px-5 py-3 transition-colors hover:bg-brand-wash/50">
                    <span className="flex min-w-0 items-baseline gap-2.5">
                      <FaultNumber id={fault.id} size="sm" />
                      <span className="truncate font-semibold">{fault.naslov}</span>
                    </span>
                    <Due fault={fault} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-rule p-3">
            <Link to="/admin/kvarovi?status=otvoreni&preuzeo=ja" className="btn-secondary w-full">{t('dashboard.allMine')}</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
