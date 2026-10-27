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

/** Registration mark at either end of the colour bar, as on a press sheet. */
function RegistrationMark() {
  return (
    <span aria-hidden="true" className="hidden w-9 shrink-0 items-center justify-center text-ink-3 sm:flex">
      <svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" /><path d="M9 0v18M0 9h18" stroke="currentColor" /></svg>
    </span>
  )
}

const PATCH_INK = {
  key: 'bg-key',
  magenta: 'bg-urgent-mark',
  // Overdue is magenta laid over the sheet in a screen, so it reads apart from urgent at a glance.
  hatch: 'bg-[repeating-linear-gradient(-45deg,rgb(var(--urgent-mark))_0_3px,rgb(var(--stock))_3px_6px)]',
  yellow: 'bg-warn-mark shadow-[inset_0_0_0_1px_rgb(var(--warn-edge))]',
  cyan: 'bg-cyan-mark',
}

// Phones: two patches over three (spans of a 6-column grid, with the inner hairlines only); from sm one row of five.
const PATCH_PLACE = {
  first: 'col-span-3 border-b border-r sm:border-b-0',
  second: 'col-span-3 border-b sm:border-b-0 sm:border-r',
  middle: 'col-span-2 border-r',
  last: 'col-span-2 sm:border-r-0',
}

function Patch({ label, value, to, ink, place, alert = false, loading }) {
  return (
    <Link to={to} className={`group grid min-w-0 grid-cols-[0.875rem_1fr] border-rule transition-colors hover:bg-brand-wash/50 sm:col-span-1 ${PATCH_PLACE[place]}`}>
      <span aria-hidden="true" className={PATCH_INK[ink]} />
      <span className="flex min-w-0 flex-col justify-between gap-1.5 px-4 py-3.5">
        <span className="field-label break-words">{label}</span>
        <span className={`numeral text-figure ${alert && value > 0 ? 'text-urgent' : 'text-ink'}`}>{loading ? '–' : value}</span>
      </span>
    </Link>
  )
}

function AttentionRow({ fault, unassigned }) {
  return (
    <li>
      <Link
        to={`/admin/kvarovi/${fault.id}`}
        className="grid grid-cols-[3rem_1fr] items-start gap-x-3 gap-y-2 px-5 py-3 transition-colors hover:bg-brand-wash/50
          md:grid-cols-[3rem_minmax(0,1fr)_6.25rem_9rem_9.5rem] md:items-center"
      >
        <FaultNumber id={fault.id} size="sm" className="pt-px md:pt-0" />
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
  const loading = (stats.loading && !s) || (faults.loading && !faults.data)
  const inProgress = open.filter((fault) => fault.status === 'U rješavanju').length

  return (
    <div>
      <PageHeader title={t('dashboard.title')} meta={<span className="font-mono text-[0.8125rem] uppercase text-ink-3">{format.dateLong(new Date())}</span>} />

      {stats.error ? (
        <div className="surface mb-5"><ErrorState error={stats.error} onRetry={stats.reload} /></div>
      ) : (
        <nav aria-label={t('dashboard.colorBar')} className="surface mb-5 flex overflow-hidden">
          <RegistrationMark />
          <div className="grid flex-1 grid-cols-6 border-rule sm:grid-cols-5 sm:border-l">
            <Patch label={t('dashboard.open')} value={s?.otvoreni_kvarovi ?? 0} loading={loading} ink="key" place="first" to="/admin/kvarovi?status=otvoreni" />
            <Patch label={t('dashboard.urgent')} value={s?.hitni_kvarovi ?? 0} loading={loading} ink="magenta" place="second" alert to="/admin/kvarovi?status=otvoreni&prioritet=Hitno" />
            <Patch label={t('dashboard.overdue')} value={s?.sla_kasni ?? 0} loading={loading} ink="hatch" place="middle" alert to="/admin/kvarovi?sla=kasni" />
            <Patch label={t('dashboard.inProgress')} value={inProgress} loading={loading} ink="yellow" place="middle" to="/admin/kvarovi?status=U%20rje%C5%A1avanju" />
            <Patch label={t('dashboard.unassigned')} value={unassigned.length} loading={loading} ink="cyan" place="last" to="/admin/kvarovi?status=otvoreni&preuzeo=nitko" />
          </div>
          <span className="hidden border-l border-rule sm:flex"><RegistrationMark /></span>
        </nav>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
        <section aria-labelledby="attention-title" className="surface min-w-0">
          <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule px-5 py-3.5">
            <h2 id="attention-title" className="text-base font-semibold">{t('dashboard.attention')}</h2>
            <div role="group" aria-label={t('dashboard.attentionFilter')} className="flex gap-1.5">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={`inline-flex min-h-[2rem] items-center gap-1.5 rounded border px-2.5 text-[0.8125rem] font-semibold transition-colors ${
                    tab === item.id ? 'border-key bg-key text-stock' : 'border-[#D2D6DC] text-ink-2 hover:border-rule-strong hover:text-ink'
                  }`}
                >
                  {item.label}
                  <span className="font-mono font-medium">{faults.data ? item.list.length : '·'}</span>
                </button>
              ))}
            </div>
            <Link to="/admin/kvarovi?status=otvoreni&sort=rizik" className="link ml-auto inline-flex items-center gap-1 text-sm">
              {t('dashboard.allOpen')} <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </header>
          <div className="hidden md:grid-cols-[3rem_minmax(0,1fr)_6.25rem_9rem_9.5rem] gap-x-3 border-b border-rule bg-[#FAFAFB] px-5 py-2 md:grid" aria-hidden="true">
            {['№', t('faults.colFault'), t('fault.priority'), t('fault.due'), `${t('fault.status')} · ${t('fault.assignee')}`].map((label) => (
              <span key={label} className="field-label">{label}</span>
            ))}
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

        <section aria-labelledby="mine-title" className="surface">
          <header className="flex items-center justify-between border-b border-rule px-5 py-3.5">
            <h2 id="mine-title" className="text-base font-semibold">{t('dashboard.mine')}</h2>
            <span className="numeral text-sm text-ink-3">{faults.data ? mine.length : ''}</span>
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
