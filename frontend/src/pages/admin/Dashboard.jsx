import { useEffect, useMemo } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, History, Pause, Wrench } from 'lucide-react'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useLiveRefresh, useLiveStatus } from '../../lib/live'
import { slaInfo } from '../../lib/sla'
import { eventTitle } from '../../lib/events'
import { useI18n } from '../../i18n'
import { useAuth } from '../../auth/AuthProvider'
import { greetingKey } from '../../lib/greeting'
import { PriorityMark, StatusMark } from '../../components/ui/Marks'
import Kpi, { Delta } from '../../components/ui/Kpi'
import FaultRow, { useReportedAt } from '../../components/FaultRow'
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/States'

const get = (path) => api.get(path).then((response) => response.data)
const QUEUE_ROWS = 5
const ACTIVITY_ROWS = 6
// Lateness changes with the clock, not only with events.
const CLOCK_REFRESH_MS = 60_000

// Most pressing reason first; faults without a reason follow, by time left.
const REASON_RANK = { kasni: 0, hitno: 1, uskoro: 2, nedodijeljen: 3, ceka_dugo: 4 }
const rank = (fault) => Math.min(9, ...(fault.razlozi_paznje || []).map((reason) => REASON_RANK[reason] ?? 9))
const minutesLeft = (fault) => slaInfo(fault).minutesLeft ?? Number.POSITIVE_INFINITY
const byAttention = (a, b) => rank(a) - rank(b) || minutesLeft(a) - minutesLeft(b)

const fullName = (person) => (person ? `${person.ime} ${person.prezime}` : '')

/** "Live" when changes arrive by themselves. A lost connection is announced by the shell (ConnectionNotice). */
function LiveState() {
  const { t } = useI18n()
  const status = useLiveStatus()
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 text-meta font-semibold text-ok">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ok-mark motion-safe:animate-pulse" />
        {t('live.on')}
      </span>
    )
  }
  return null
}

function ViewAll({ to, children }) {
  return (
    <Link to={to} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
      {children} <ArrowRight size={15} aria-hidden="true" />
    </Link>
  )
}

/** Desktop and tablet: the priority queue as a table; every row opens the fault. */
function QueueTable({ faults }) {
  const { t } = useI18n()
  const reportedAt = useReportedAt()
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="table-head">
          <th scope="col" className="w-[30%] py-2.5 pl-5 pr-3 font-medium">{t('dashboard.colMachine')}</th>
          <th scope="col" className="w-[15%] px-3 py-2.5 font-medium">{t('fault.priority')}</th>
          <th scope="col" className="w-[17%] px-3 py-2.5 font-medium">{t('fault.status')}</th>
          <th scope="col" className="w-[15%] px-3 py-2.5 font-medium">{t('dashboard.colReported')}</th>
          <th scope="col" className="px-3 py-2.5 font-medium">{t('dashboard.colOwner')}</th>
          <th scope="col" className="w-10 py-2.5 pr-4"><span className="sr-only">{t('common.open')}</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-rule">
        {faults.map((fault) => (
          <tr key={fault.id} className="group relative transition-colors hover:bg-brand-wash/50">
            <td className="py-3.5 pl-5 pr-3">
              <Link to={`/admin/kvarovi/${fault.id}`} className="block min-w-0 font-semibold text-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-brand">
                <span className="block truncate">{fault.oprema?.naziv || fault.naslov}</span>
              </Link>
              <span className="block truncate text-meta text-ink-3">
                <span className="numeral">#{fault.id}</span> · {fault.naslov}
              </span>
            </td>
            <td className="px-3 py-3.5"><PriorityMark priority={fault.prioritet} className="text-[0.75rem]" /></td>
            <td className="px-3 py-3.5"><StatusMark status={fault.status} className="text-[0.75rem]" /></td>
            <td className="whitespace-nowrap px-3 py-3.5 text-ink-2">
              <time dateTime={fault.datum_prijave}>{reportedAt(fault.datum_prijave)}</time>
            </td>
            <td className="truncate px-3 py-3.5 text-ink-2">{fault.voditelj ? fullName(fault.voditelj) : <span className="text-ink-3">{t('fault.unassigned')}</span>}</td>
            <td className="py-3.5 pr-4 text-right">
              <ChevronRight size={18} aria-hidden="true" className="inline text-ink-3 transition-transform group-hover:translate-x-0.5" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const EVENT_DOT = {
  created: 'bg-new-mark',
  assignment: 'bg-brand',
  komentar: 'bg-slate-mark',
  prioritet: 'bg-urgent-mark',
}
const STATUS_DOT = { Novo: 'bg-new-mark', 'U rješavanju': 'bg-brand', 'Na čekanju': 'bg-warn-mark', 'Riješeno': 'bg-ok-mark' }
const dotFor = (item) => (item.tip === 'status' ? STATUS_DOT[item.podaci?.new] : EVENT_DOT[item.tip]) || 'bg-slate-mark'

function Activity({ items, people }) {
  const i18n = useI18n()
  const { t, format } = i18n
  const when = useReportedAt({ compact: true })
  if (items.length === 0) return <EmptyState icon={History} title={t('dashboard.activityEmpty')} className="py-8" />
  return (
    <ol className="px-2 pb-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link to={`/admin/kvarovi/${item.kvar_id}`} className="grid grid-cols-[3rem_0.75rem_minmax(0,1fr)] items-start gap-x-2 rounded px-3 py-2.5 transition-colors hover:bg-brand-wash/50">
            <time dateTime={item.kreiran} title={format.dateTime(item.kreiran)} className="pt-px text-meta tabular text-ink-3">
              {when(item.kreiran)}
            </time>
            <span aria-hidden="true" className={`mt-1.5 h-2 w-2 rounded-full ${dotFor(item)}`} />
            <span className="min-w-0">
              <span className="line-clamp-2 text-sm font-semibold text-ink">
                {eventTitle(item, i18n, people)}
                {item.interno && <span className="font-normal text-ink-3"> · {t('fault.internal')}</span>}
              </span>
              <span className="block truncate text-meta text-ink-2">
                {item.oprema_naziv || item.kvar_naslov} · <span className="numeral">#{item.kvar_id}</span>
              </span>
              {item.korisnik && <span className="block truncate text-meta text-ink-3">{fullName(item.korisnik)}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

export default function Dashboard() {
  const { t } = useI18n()
  const { user } = useAuth()
  const overview = useAsync(() => get('/dashboard/pregled?period=7d'), [])
  const faults = useAsync(() => get('/kvarovi?status=otvoreni').then(asArray), [])

  useEffect(() => {
    document.title = `${t('dashboard.title')} · ${t('app.name')}`
  }, [t])

  // Every change to any fault shows here within a moment; lateness also moves with the clock.
  useLiveRefresh(() => {
    overview.refresh()
    faults.refresh()
  })
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        overview.refresh()
        faults.refresh()
      }
    }, CLOCK_REFRESH_MS)
    return () => clearInterval(timer)
  }, [overview.refresh, faults.refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const queue = useMemo(() => [...(faults.data || [])].sort(byAttention).slice(0, QUEUE_ROWS), [faults.data])
  const data = overview.data
  const kpi = data?.kpi
  const loadingKpi = overview.loading && !data
  const people = useMemo(
    () => Object.fromEntries((data?.opterecenje || []).map((row) => [row.korisnik.id, fullName(row.korisnik)])),
    [data],
  )
  const vsWeek = t('dashboard.vsWeek')
  const vsYesterday = t('dashboard.vsYesterday')

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[1.75rem]">
            {t(greetingKey(), { name: user?.ime || '' })}
          </h1>
          <p className="mt-1 text-ink-2">{t('dashboard.subtitle')}</p>
        </div>
      </div>

      {overview.error && !data ? (
        <div className="surface mb-5"><ErrorState error={overview.error} onRetry={overview.reload} /></div>
      ) : (
        <nav aria-label={t('dashboard.kpiNav')} className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:mb-6 xl:grid-cols-4">
          <Kpi
            label={t('dashboard.openFaults')}
            value={kpi?.otvoreni ?? 0}
            icon={Wrench}
            delta={kpi && <Delta now={kpi.otvoreni} before={kpi.otvoreni_prije_tjedan} reference={vsWeek} />}
            reference={vsWeek}
            loading={loadingKpi}
            to="/admin/kvarovi"
          />
          <Kpi
            label={t('dashboard.urgent')}
            value={kpi?.hitni ?? 0}
            icon={AlertTriangle}
            tone="danger"
            delta={kpi && <Delta now={kpi.hitni} before={kpi.hitni_prije_tjedan} reference={vsWeek} />}
            reference={vsWeek}
            loading={loadingKpi}
            to="/admin/kvarovi?prioritet=Hitno&sort=rizik"
          />
          <Kpi
            label={t('dashboard.waiting')}
            value={kpi?.na_cekanju ?? 0}
            icon={Pause}
            tone="warning"
            delta={kpi && <Delta now={kpi.na_cekanju} before={kpi.na_cekanju_prije_tjedan} reference={vsWeek} />}
            reference={vsWeek}
            loading={loadingKpi}
            to="/admin/kvarovi?status=Na čekanju"
          />
          <Kpi
            label={t('dashboard.resolvedToday')}
            value={kpi?.rijeseni_danas ?? 0}
            icon={CheckCircle2}
            tone="success"
            delta={kpi && <Delta now={kpi.rijeseni_danas} before={kpi.rijeseni_jucer} better="up" reference={vsYesterday} />}
            reference={vsYesterday}
            loading={loadingKpi}
            to="/admin/kvarovi?pregled=rijeseni&rijeseno=danas"
          />
        </nav>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-labelledby="queue-title" className="surface min-w-0 overflow-hidden">
          <header className="card-head">
            <h2 id="queue-title" className="card-title">{t('dashboard.priorityTitle')}</h2>
            <ViewAll to="/admin/kvarovi?sort=rizik">{t('dashboard.viewAll')}</ViewAll>
          </header>
          {faults.loading && !faults.data ? (
            <LoadingRows rows={4} />
          ) : faults.error && !faults.data ? (
            <ErrorState error={faults.error} onRetry={faults.reload} />
          ) : queue.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={t('dashboard.attentionEmpty')} />
          ) : (
            <>
              <div className="hidden md:block"><QueueTable faults={queue} /></div>
              <ul className="divide-y divide-rule border-t border-rule md:hidden">
                {queue.map((fault) => <li key={fault.id}><FaultRow fault={fault} to={`/admin/kvarovi/${fault.id}`} /></li>)}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="activity-title" className="surface min-w-0">
          <header className="card-head">
            <h2 id="activity-title" className="card-title">{t('dashboard.liveTitle')}</h2>
            <span className="ml-auto"><LiveState /></span>
          </header>
          {loadingKpi ? <LoadingRows rows={3} /> : <Activity items={(data?.aktivnosti || []).slice(0, ACTIVITY_ROWS)} people={people} />}
        </section>
      </div>
    </div>
  )
}
