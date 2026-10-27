import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, CheckCircle2, History, Inbox, Users } from 'lucide-react'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { slaInfo } from '../../lib/sla'
import { eventTitle } from '../../lib/events'
import { useI18n } from '../../i18n'
import { useAuth } from '../../auth/AuthProvider'
import { AttentionReasons, Due, FaultNumber, PriorityMark, StatusMark, WaitingTag } from '../../components/ui/Marks'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../../components/ui/States'
import Segmented from '../../components/ui/Segmented'

const get = (path) => api.get(path).then((response) => response.data)
const ATTENTION_ROWS = 10
const REFRESH_MS = 60_000
const PERIODS = ['danas', '7d', '30d', 'mjesec']
const PERIOD_KEY = 'adix.overviewPeriod'
const ROW_COLUMNS = 'lg:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,14rem)_8.5rem]'

// Most pressing reason first; faults without a reason follow, by time left.
const REASON_RANK = { kasni: 0, hitno: 1, uskoro: 2, nedodijeljen: 3, ceka_dugo: 4 }
const rank = (fault) => Math.min(9, ...(fault.razlozi_paznje || []).map((reason) => REASON_RANK[reason] ?? 9))
const minutesLeft = (fault) => slaInfo(fault).minutesLeft ?? Number.POSITIVE_INFINITY
const byAttention = (a, b) => rank(a) - rank(b) || minutesLeft(a) - minutesLeft(b)

const fullName = (person) => (person ? `${person.ime} ${person.prezime}` : '')

function readPeriod() {
  try {
    const value = localStorage.getItem(PERIOD_KEY)
    return PERIODS.includes(value) ? value : '7d'
  } catch {
    return '7d'
  }
}

function Figure({ label, value, sub, to, alert = false, loading }) {
  return (
    <Link to={to} className="group flex min-w-0 flex-col justify-between gap-2 border-b border-r border-rule px-4 py-3.5 transition-colors hover:bg-brand-wash/60 sm:px-5">
      <span className="field-label truncate">{label}</span>
      <span className="flex items-end justify-between gap-2">
        <span className={`numeral text-figure ${alert && value > 0 ? 'text-urgent' : 'text-ink'}`}>{loading ? '–' : value}</span>
        <ArrowRight size={18} aria-hidden="true" className="mb-1 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </span>
      <span className="min-h-[1.125rem] truncate text-meta text-ink-2">{loading ? '' : sub}</span>
    </Link>
  )
}

function AttentionRow({ fault, unassigned }) {
  return (
    <li>
      <Link
        to={`/admin/kvarovi/${fault.id}`}
        className={`grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-5 py-3 transition-colors hover:bg-brand-wash/50 ${ROW_COLUMNS} lg:items-center`}
      >
        <FaultNumber id={fault.id} size="sm" className="pt-0.5 lg:pt-0" />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink">{fault.naslov}</span>
          <span className="block truncate text-meta text-ink-2">{[fault.oprema?.naziv, fault.komponenta?.naziv].filter(Boolean).join(' · ')}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusMark status={fault.status} className="text-meta" />
            <span className="truncate text-meta text-ink-2">{fault.voditelj ? fullName(fault.voditelj) : <span className="text-ink-3">{unassigned}</span>}</span>
          </span>
        </span>
        <span className="col-start-2 min-w-0 lg:col-start-auto">
          {fault.razlozi_paznje?.length ? (
            <AttentionReasons fault={fault} className="lg:flex-col lg:gap-y-1" />
          ) : fault.status === 'Na čekanju' ? (
            <WaitingTag fault={fault} />
          ) : (
            <PriorityMark priority={fault.prioritet} />
          )}
        </span>
        <Due fault={fault} className="col-start-2 min-w-[7rem] lg:col-start-auto" />
      </Link>
    </li>
  )
}

function Workload({ rows, unassigned, userId }) {
  const { t } = useI18n()
  const max = Math.max(1, unassigned, ...rows.map((row) => row.otvoreni))
  const bar = (n, late) => (
    <span aria-hidden="true" className="due-bar mt-1.5" data-late={late ? '' : undefined}>
      <i style={{ width: `${Math.max(n ? 4 : 0, Math.round((n / max) * 100))}%` }} />
    </span>
  )
  return (
    <ul className="divide-y divide-rule">
      {unassigned > 0 && (
        <li>
          <Link to="/admin/kvarovi?status=otvoreni&preuzeo=nitko" className="block px-5 py-2.5 transition-colors hover:bg-brand-wash/50">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-warn">{t('dashboard.workloadUnassigned')}</span>
              <span className="numeral text-lg text-warn">{unassigned}</span>
            </span>
            {bar(unassigned, false)}
          </Link>
        </li>
      )}
      {rows.map((row) => {
        const details = [
          row.u_rjesavanju ? t('dashboard.loadInProgress', { n: row.u_rjesavanju }) : null,
          row.na_cekanju ? t('dashboard.loadWaiting', { n: row.na_cekanju }) : null,
        ].filter(Boolean)
        return (
          <li key={row.korisnik.id}>
            <Link to={`/admin/kvarovi?status=otvoreni&preuzeo=${row.korisnik.id}`} className="block px-5 py-2.5 transition-colors hover:bg-brand-wash/50">
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-ink">
                  {fullName(row.korisnik)}
                  {String(row.korisnik.id) === String(userId) && <span className="font-normal text-ink-3"> · {t('dashboard.you')}</span>}
                </span>
                <span className={`numeral text-lg ${row.otvoreni ? 'text-ink' : 'text-ink-3'}`}>{row.otvoreni}</span>
              </span>
              {bar(row.otvoreni, row.kasni > 0)}
              {(details.length > 0 || row.kasni > 0) && (
                <span className="mt-1 flex flex-wrap gap-x-2 text-meta text-ink-2">
                  {details.join(' · ')}
                  {row.kasni > 0 && <span className="font-semibold text-urgent">{t('dashboard.loadLate', { n: row.kasni })}</span>}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function Activity({ items, people }) {
  const i18n = useI18n()
  const { t, format } = i18n
  if (items.length === 0) return <EmptyState icon={History} title={t('dashboard.activityEmpty')} className="py-8" />
  return (
    <ol className="divide-y divide-rule">
      {items.map((item) => (
        <li key={item.id}>
          <Link to={`/admin/kvarovi/${item.kvar_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-5 py-2.5 transition-colors hover:bg-brand-wash/50">
            <span className="min-w-0">
              <span className="block truncate text-[0.9375rem] font-medium text-ink">
                {eventTitle(item, i18n, people)}
                {item.interno && <span className="font-normal text-ink-3"> · {t('fault.internal')}</span>}
              </span>
              <span className="block truncate text-meta text-ink-2">
                <span className="numeral text-ink-3">#{item.kvar_id}</span> {item.kvar_naslov}
                {item.korisnik ? ` · ${fullName(item.korisnik)}` : ''}
              </span>
            </span>
            <time dateTime={item.kreiran} title={format.dateTime(item.kreiran)} className="whitespace-nowrap pt-0.5 text-meta text-ink-3">
              {format.ago(item.kreiran)}
            </time>
          </Link>
        </li>
      ))}
    </ol>
  )
}

export default function Dashboard() {
  const { t, format } = useI18n()
  const { user } = useAuth()
  const [tab, setTab] = useState('all')
  const [period, setPeriodState] = useState(readPeriod)
  const overview = useAsync(() => get(`/dashboard/pregled?period=${period}`), [period])
  const faults = useAsync(() => get('/kvarovi?status=otvoreni').then(asArray), [])

  const setPeriod = (value) => {
    setPeriodState(value)
    try {
      localStorage.setItem(PERIOD_KEY, value)
    } catch {
      // Remembering the period is a convenience only.
    }
  }

  useEffect(() => {
    document.title = `${t('dashboard.title')} · ${t('app.name')}`
  }, [t])

  // Keep a wall-mounted or long-open overview current without a manual reload.
  const { reload: reloadOverview } = overview
  const { reload: reloadFaults } = faults
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      reloadOverview()
      reloadFaults()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [reloadOverview, reloadFaults])

  const open = useMemo(() => [...(faults.data || [])].sort(byAttention), [faults.data])
  const unassigned = useMemo(() => open.filter((fault) => !fault.voditelj_id), [open])
  const mine = useMemo(() => open.filter((fault) => String(fault.voditelj_id) === String(user?.id)), [open, user?.id])
  const tabs = [
    { id: 'all', label: t('dashboard.tabAll'), list: open },
    { id: 'unassigned', label: t('dashboard.tabUnassigned'), list: unassigned },
    { id: 'mine', label: t('dashboard.tabMine'), list: mine },
  ]
  const shown = (tabs.find((item) => item.id === tab) || tabs[0]).list.slice(0, ATTENTION_ROWS)

  const data = overview.data
  const kpi = data?.kpi
  const loadingKpi = overview.loading && !data
  const people = useMemo(
    () => Object.fromEntries((data?.opterecenje || []).map((row) => [row.korisnik.id, fullName(row.korisnik)])),
    [data],
  )

  return (
    <div>
      <PageHeader
        title={t('dashboard.title')}
        meta={format.dateLong(new Date())}
        actions={
          <Segmented
            label={t('dashboard.periodLabel')}
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((value) => ({ value, label: t(`dashboard.periods.${value}`) }))}
          />
        }
      />

      {overview.error && !data ? (
        <div className="surface mb-6"><ErrorState error={overview.error} onRetry={overview.reload} /></div>
      ) : (
        <nav aria-label={t('dashboard.kpiNav')} className="surface mb-6 grid grid-cols-2 overflow-hidden border-b-0 border-r-0 md:grid-cols-3 xl:grid-cols-6">
          <Figure
            label={t('dashboard.open')}
            value={kpi?.otvoreni ?? 0}
            sub={kpi && t('dashboard.openSub', { progress: kpi.u_rjesavanju, waiting: kpi.na_cekanju })}
            loading={loadingKpi}
            to="/admin/kvarovi?status=otvoreni"
          />
          <Figure label={t('dashboard.urgent')} value={kpi?.hitni ?? 0} sub={t('dashboard.urgentSub')} loading={loadingKpi} alert to="/admin/kvarovi?status=otvoreni&prioritet=Hitno" />
          <Figure label={t('dashboard.overdue')} value={kpi?.kasni ?? 0} sub={t('dashboard.overdueSub')} loading={loadingKpi} alert to="/admin/kvarovi?sla=kasni&sort=rizik" />
          <Figure label={t('dashboard.unassigned')} value={kpi?.nedodijeljeni ?? 0} sub={t('dashboard.unassignedSub')} loading={loadingKpi} to="/admin/kvarovi?status=otvoreni&preuzeo=nitko&sort=rizik" />
          <Figure
            label={t('dashboard.waitingParts')}
            value={kpi?.ceka_dijelove ?? 0}
            sub={kpi && t('dashboard.waitingPartsSub', { n: kpi.na_cekanju })}
            loading={loadingKpi}
            to="/admin/kvarovi?cekanje=dijelovi"
          />
          <Figure
            label={`${t('dashboard.resolved')} · ${t(`dashboard.periods.${period}`)}`}
            value={kpi?.rijeseni_u_periodu ?? 0}
            sub={kpi && t('dashboard.resolvedSub', { n: kpi.prijavljeni_u_periodu })}
            loading={loadingKpi}
            to={`/admin/kvarovi?status=Riješeno&rijeseno=${period}`}
          />
        </nav>
      )}

      {/* Phones: attention, then my faults and workload, then activity. Desktop: activity under attention. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-labelledby="attention-title" className="surface min-w-0 xl:col-start-1 xl:row-start-1">
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
            <div className={`hidden border-b border-rule bg-ground/50 px-5 py-2 lg:grid lg:gap-x-3 ${ROW_COLUMNS}`} aria-hidden="true">
              <span className="field-label">#</span>
              <span className="field-label">{t('faults.colFault')}</span>
              <span className="field-label">{t('dashboard.why')}</span>
              <span className="field-label">{t('fault.due')}</span>
            </div>
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

        <div className="space-y-6 xl:col-start-2 xl:row-span-2 xl:row-start-1">
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
                {mine.slice(0, 4).map((fault) => (
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

          <section aria-labelledby="workload-title" className="surface">
            <header className="border-b border-rule px-5 py-3.5">
              <h2 id="workload-title" className="text-lg font-semibold">{t('dashboard.workload')}</h2>
              <p className="text-meta text-ink-2">{t('dashboard.workloadHint')}</p>
            </header>
            {loadingKpi ? (
              <LoadingRows rows={3} />
            ) : overview.error && !data ? null : (data?.opterecenje || []).length === 0 ? (
              <EmptyState icon={Users} title={t('dashboard.workloadEmpty')} className="py-8" />
            ) : (
              <Workload rows={data.opterecenje} unassigned={kpi.nedodijeljeni} userId={user?.id} />
            )}
          </section>
        </div>

          <section aria-labelledby="activity-title" className="surface min-w-0 xl:col-start-1 xl:row-start-2">
            <header className="flex items-center justify-between border-b border-rule px-5 py-3.5">
              <h2 id="activity-title" className="text-lg font-semibold">{t('dashboard.activity')}</h2>
              {data && <span className="text-meta text-ink-3">{t('dashboard.updatedAt', { time: format.time(data.do) })}</span>}
            </header>
            {loadingKpi ? <LoadingRows rows={3} /> : <Activity items={data?.aktivnosti || []} people={people} />}
          </section>
      </div>
    </div>
  )
}
