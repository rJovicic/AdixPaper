import { useEffect, useMemo } from 'react'
import { Link } from 'react-router'
import { ArrowRight, CheckCircle2, ClipboardList, Pause, Plus, Wrench } from 'lucide-react'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useLiveRefresh } from '../../lib/live'
import { isUpdated } from '../../lib/seen'
import { useI18n } from '../../i18n'
import { useAuth } from '../../auth/AuthProvider'
import Kpi from '../../components/ui/Kpi'
import FaultRow from '../../components/FaultRow'
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/States'
import { greetingKey } from '../../lib/greeting'

const SHOWN = 5
const WEEK_MS = 7 * 24 * 3600 * 1000

/** The worker's home: report a fault in one tap, and where their own reports stand. */
export default function WorkerHome() {
  const { t } = useI18n()
  const { user } = useAuth()
  const faults = useAsync(() => api.get('/kvarovi').then((response) => asArray(response.data)), [])
  // Workers keep this screen open to see whether someone is on it: changes arrive live.
  useLiveRefresh(faults.refresh)

  useEffect(() => {
    document.title = `${t('worker.title')} · ${t('app.name')}`
  }, [t])

  const list = useMemo(() => faults.data || [], [faults.data])
  const open = list.filter((fault) => fault.status !== 'Riješeno')
  const counts = useMemo(() => {
    const since = Date.now() - WEEK_MS
    return {
      open: open.length,
      untaken: open.filter((fault) => !fault.voditelj_id && !fault.voditelj).length,
      inProgress: open.filter((fault) => fault.status === 'U rješavanju').length,
      waiting: open.filter((fault) => fault.status === 'Na čekanju').length,
      resolved: list.filter((fault) => fault.status === 'Riješeno' && new Date(fault.datum_rjesavanja).getTime() >= since).length,
    }
  }, [list, open])
  const loading = faults.loading && !faults.data

  return (
    <div>
      <h1 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.01em] text-ink">{t(greetingKey(), { name: user?.ime || '' })}</h1>
      <p className="mt-1 text-ink-2">{t('worker.homeSubtitle')}</p>

      <Link to="/radnik/prijava" className="btn-primary btn-lg mt-4 w-full">
        <Plus size={20} aria-hidden="true" /> {t('worker.report')}
      </Link>

      <nav aria-label={t('worker.kpiNav')} className="mt-4 grid grid-cols-2 gap-3">
        <Kpi label={t('worker.kpiOpen')} value={counts.open} icon={ClipboardList} sub={t('worker.kpiOpenSub', { n: counts.untaken })} loading={loading} to="/radnik/kvarovi" />
        <Kpi label={t('worker.kpiInProgress')} value={counts.inProgress} icon={Wrench} tone="info" sub={t('worker.kpiInProgressSub')} loading={loading} to="/radnik/kvarovi" />
        <Kpi label={t('worker.kpiWaiting')} value={counts.waiting} icon={Pause} tone="warning" sub={t('worker.kpiWaitingSub')} loading={loading} to="/radnik/kvarovi" />
        <Kpi label={t('worker.kpiResolved')} value={counts.resolved} icon={CheckCircle2} tone="success" sub={t('worker.kpiResolvedSub')} loading={loading} to="/radnik/kvarovi?pregled=rijeseni" />
      </nav>

      <section aria-labelledby="mine-title" className="surface mt-5 overflow-hidden">
        <header className="card-head">
          <h2 id="mine-title" className="card-title">{t('worker.activeTitle')}</h2>
          <Link to="/radnik/kvarovi" className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
            {t('worker.viewAll')} <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </header>
        {loading ? (
          <LoadingRows rows={3} />
        ) : faults.error && !faults.data ? (
          <ErrorState error={faults.error} onRetry={faults.reload} />
        ) : open.length === 0 ? (
          <EmptyState icon={ClipboardList} title={t('worker.emptyOpenTitle')} body={t('worker.emptyOpenBody')} />
        ) : (
          <ul className="divide-y divide-rule border-t border-rule">
            {open.slice(0, SHOWN).map((fault) => (
              <li key={fault.id}>
                <FaultRow fault={fault} to={`/radnik/kvar/${fault.id}`} updated={isUpdated(user?.id, fault)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
