import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, CheckCircle2, ClipboardList, History, PauseCircle, Plus, Siren, WifiOff } from 'lucide-react'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useLiveRefresh, useLiveStatus } from '../../lib/live'
import { slaInfo } from '../../lib/sla'
import { eventTitle } from '../../lib/events'
import { useI18n } from '../../i18n'
import { useAuth } from '../../auth/AuthProvider'
import { AttentionReasons, Due, FaultNumber, PriorityMark, StatusMark, WaitingTag } from '../../components/ui/Marks'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../../components/ui/States'

const get = (path) => api.get(path).then((response) => response.data)
const QUEUE_ROWS = 6
const RECENT_ROWS = 6
const ACTIVITY_ROWS = 8
const PERIOD = '7d'
// Lateness changes with the clock, not only with events.
const CLOCK_REFRESH_MS = 60_000

// Most pressing reason first; faults without a reason follow, by time left.
const REASON_RANK = { kasni: 0, hitno: 1, uskoro: 2, nedodijeljen: 3, ceka_dugo: 4 }
const rank = (fault) => Math.min(9, ...(fault.razlozi_paznje || []).map((reason) => REASON_RANK[reason] ?? 9))
const minutesLeft = (fault) => slaInfo(fault).minutesLeft ?? Number.POSITIVE_INFINITY
const byAttention = (a, b) => rank(a) - rank(b) || minutesLeft(a) - minutesLeft(b)

const fullName = (person) => (person ? `${person.ime} ${person.prezime}` : '')

const FIGURE_TONE = {
  info: 'bg-info-wash text-brand',
  danger: 'bg-urgent-wash text-urgent',
  warning: 'bg-warn-wash text-warn',
  success: 'bg-ok-wash text-ok',
}

/** One key figure; the whole card opens the matching list. */
function Figure({ label, value, sub, to, icon: Icon, tone = 'info', alert = false, loading }) {
  return (
    <Link to={to} className="surface group flex min-w-0 flex-col gap-1.5 p-3 transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-lift sm:gap-2 sm:p-4">
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold leading-tight text-ink-2">{label}</span>
        <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md sm:h-8 sm:w-8 ${FIGURE_TONE[tone]}`}>
          <Icon size={16} />
        </span>
      </span>
      <span className={`numeral text-[1.75rem] leading-none sm:text-figure ${alert && value > 0 ? 'text-urgent' : 'text-ink'}`}>{loading ? '–' : value}</span>
      <span className="line-clamp-2 min-h-[1.125rem] text-meta leading-snug text-ink-2">{loading ? '' : sub}</span>
    </Link>
  )
}

function SectionHeader({ id, title, action }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-3 sm:px-5">
      <h2 id={id} className="text-base font-semibold sm:text-lg">{title}</h2>
      {action && <span className="ml-auto">{action}</span>}
    </header>
  )
}

function QueueRow({ fault }) {
  const { t } = useI18n()
  return (
    <li>
      <Link to={`/admin/kvarovi/${fault.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-brand-wash/50 sm:px-5">
        <span className="min-w-0">
          <span className="flex min-w-0 items-baseline gap-2">
            <FaultNumber id={fault.id} size="sm" />
            <span className="truncate font-semibold text-ink">{fault.naslov}</span>
          </span>
          <span className="mt-0.5 block truncate text-meta text-ink-2">
            {[fault.oprema?.naziv, fault.voditelj ? fullName(fault.voditelj) : t('fault.unassigned')].filter(Boolean).join(' · ')}
          </span>
        </span>
        <Due fault={fault} className="text-right" />
        <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusMark status={fault.status} className="text-meta" />
          {fault.razlozi_paznje?.some((reason) => reason !== 'uskoro') ? (
            <AttentionReasons fault={fault} withTime={false} className="text-meta" />
          ) : fault.status === 'Na čekanju' ? (
            <WaitingTag fault={fault} className="text-meta" />
          ) : null}
        </span>
      </Link>
    </li>
  )
}

function RecentRow({ fault }) {
  const { t, format } = useI18n()
  return (
    <li>
      <Link to={`/admin/kvarovi/${fault.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 transition-colors hover:bg-brand-wash/50 sm:px-5 md:grid-cols-[minmax(0,1fr)_7rem_8rem_6.5rem]">
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink">
            <span className="numeral text-ink-3">#{fault.id}</span> {fault.naslov}
          </span>
          <span className="block truncate text-meta text-ink-2">
            {fault.oprema?.naziv || '—'} · {fault.voditelj ? fullName(fault.voditelj) : t('fault.unassigned')}
          </span>
        </span>
        <span className="hidden md:block"><PriorityMark priority={fault.prioritet} className="text-meta" /></span>
        <span><StatusMark status={fault.status} className="text-meta" /></span>
        <time dateTime={fault.datum_prijave} title={format.dateTime(fault.datum_prijave)} className="hidden whitespace-nowrap text-right text-meta text-ink-2 md:block">
          {format.ago(fault.datum_prijave)}
        </time>
      </Link>
    </li>
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
          <Link to={`/admin/kvarovi/${item.kvar_id}`} className="block px-4 py-2.5 transition-colors hover:bg-brand-wash/50 sm:px-5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium text-ink">
                {eventTitle(item, i18n, people)}
                {item.interno && <span className="font-normal text-ink-3"> · {t('fault.internal')}</span>}
              </span>
              <time dateTime={item.kreiran} title={format.dateTime(item.kreiran)} className="shrink-0 whitespace-nowrap text-meta text-ink-3">
                {format.ago(item.kreiran)}
              </time>
            </span>
            <span className="block truncate text-meta text-ink-2">
              <span className="numeral text-ink-3">#{item.kvar_id}</span> {item.kvar_naslov}
              {item.korisnik ? ` · ${fullName(item.korisnik)}` : ''}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

/** "Live" when changes arrive by themselves; otherwise say the data may be behind. */
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
  if (status === 'connecting') return null
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-meta font-semibold text-warn">
      <WifiOff size={14} aria-hidden="true" />
      {status === 'offline' ? t('live.offline') : t('live.reconnecting')}
    </span>
  )
}

export default function Dashboard() {
  const { t, format } = useI18n()
  const { user } = useAuth()
  const [tab, setTab] = useState('all')
  const overview = useAsync(() => get(`/dashboard/pregled?period=${PERIOD}`), [])
  const faults = useAsync(() => get('/kvarovi?status=otvoreni').then(asArray), [])
  const recent = useAsync(() => get(`/kvarovi?limit=${RECENT_ROWS}`).then(asArray), [])

  useEffect(() => {
    document.title = `${t('dashboard.title')} · ${t('app.name')}`
  }, [t])

  // Every change to any fault shows here within a moment; lateness also moves with the clock.
  const refreshAll = () => {
    overview.refresh()
    faults.refresh()
    recent.refresh()
  }
  useLiveRefresh(refreshAll)
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        overview.refresh()
        faults.refresh()
      }
    }, CLOCK_REFRESH_MS)
    return () => clearInterval(timer)
  }, [overview.refresh, faults.refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = useMemo(() => [...(faults.data || [])].sort(byAttention), [faults.data])
  const unassigned = useMemo(() => open.filter((fault) => !fault.voditelj_id), [open])
  const mine = useMemo(() => open.filter((fault) => String(fault.voditelj_id) === String(user?.id)), [open, user?.id])
  const tabs = [
    { id: 'all', label: t('dashboard.tabAll'), list: open },
    { id: 'unassigned', label: t('dashboard.tabUnassigned'), list: unassigned },
    { id: 'mine', label: t('dashboard.tabMine'), list: mine },
  ]
  const queue = (tabs.find((item) => item.id === tab) || tabs[0]).list.slice(0, QUEUE_ROWS)

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
        meta={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">{format.dateLong(new Date())} <LiveState /></span>}
        actions={
          <Link to="/admin/prijava" className="btn-primary">
            <Plus size={18} aria-hidden="true" /> {t('dashboard.report')}
          </Link>
        }
      />

      {overview.error && !data ? (
        <div className="surface mb-5"><ErrorState error={overview.error} onRetry={overview.reload} /></div>
      ) : (
        <nav aria-label={t('dashboard.kpiNav')} className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure
            label={t('dashboard.open')}
            value={kpi?.otvoreni ?? 0}
            sub={kpi && t('dashboard.openSub2', { n: kpi.u_rjesavanju, untaken: kpi.nedodijeljeni })}
            loading={loadingKpi}
            icon={ClipboardList}
            to="/admin/kvarovi"
          />
          <Figure
            label={t('dashboard.urgent')}
            value={kpi?.hitni ?? 0}
            sub={kpi && (kpi.kasni ? t('dashboard.urgentLate', { n: kpi.kasni }) : t('dashboard.urgentSub'))}
            loading={loadingKpi}
            alert
            icon={Siren}
            tone="danger"
            to="/admin/kvarovi?prioritet=Hitno&sort=rizik"
          />
          <Figure
            label={t('dashboard.waiting')}
            value={kpi?.na_cekanju ?? 0}
            sub={kpi && t('dashboard.waitingSub', { n: kpi.ceka_dijelove })}
            loading={loadingKpi}
            icon={PauseCircle}
            tone="warning"
            to="/admin/kvarovi?status=Na čekanju"
          />
          <Figure
            label={t('dashboard.resolved7')}
            value={kpi?.rijeseni_u_periodu ?? 0}
            sub={kpi && t('dashboard.reported7', { n: kpi.prijavljeni_u_periodu })}
            loading={loadingKpi}
            icon={CheckCircle2}
            tone="success"
            to={`/admin/kvarovi?pregled=rijeseni&rijeseno=${PERIOD}`}
          />
        </nav>
      )}

      {/* Phones: the queue first, then recent reports, then activity. Desktop: activity beside them. */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <section aria-labelledby="queue-title" className="surface min-w-0">
            <SectionHeader
              id="queue-title"
              title={t('dashboard.attention')}
              action={
                <Link to="/admin/kvarovi?sort=rizik" className="link inline-flex items-center gap-1 text-sm">
                  {t('dashboard.allOpen')} <ArrowRight size={15} aria-hidden="true" />
                </Link>
              }
            />
            <div role="group" aria-label={t('dashboard.attentionFilter')} className="flex gap-1 border-b border-rule px-3 py-2 sm:px-4">
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
            {faults.loading && !faults.data ? (
              <LoadingRows rows={4} />
            ) : faults.error && !faults.data ? (
              <ErrorState error={faults.error} onRetry={faults.reload} />
            ) : queue.length === 0 ? (
              <EmptyState icon={CheckCircle2} title={tab === 'all' ? t('dashboard.attentionEmpty') : t('dashboard.tabEmpty')} />
            ) : (
              <ul className="divide-y divide-rule">
                {queue.map((fault) => <QueueRow key={fault.id} fault={fault} />)}
              </ul>
            )}
          </section>

          <section aria-labelledby="recent-title" className="surface min-w-0">
            <SectionHeader
              id="recent-title"
              title={t('dashboard.recent')}
              action={
                <Link to="/admin/kvarovi" className="link inline-flex items-center gap-1 text-sm">
                  {t('dashboard.allFaults')} <ArrowRight size={15} aria-hidden="true" />
                </Link>
              }
            />
            {recent.loading && !recent.data ? (
              <LoadingRows rows={3} />
            ) : recent.error && !recent.data ? (
              <ErrorState error={recent.error} onRetry={recent.reload} />
            ) : (recent.data || []).length === 0 ? (
              <EmptyState icon={ClipboardList} title={t('dashboard.recentEmpty')} className="py-8" />
            ) : (
              <ul className="divide-y divide-rule">
                {recent.data.map((fault) => <RecentRow key={fault.id} fault={fault} />)}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="activity-title" className="surface min-w-0">
          <SectionHeader id="activity-title" title={t('dashboard.activity')} />
          {loadingKpi ? <LoadingRows rows={3} /> : <Activity items={(data?.aktivnosti || []).slice(0, ACTIVITY_ROWS)} people={people} />}
        </section>
      </div>
    </div>
  )
}
