import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { CheckCircle2, ClipboardList } from 'lucide-react'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useLiveRefresh } from '../../lib/live'
import { useI18n } from '../../i18n'
import FaultRow from '../../components/FaultRow'
import { useAuth } from '../../auth/AuthProvider'
import { isUpdated } from '../../lib/seen'
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/States'

/** Every fault the worker reported: active ones first, resolved ones a tab away. */
export default function MyFaults() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = params.get('pregled') === 'rijeseni' ? 'resolved' : 'open'
  const { user } = useAuth()
  const faults = useAsync(() => api.get('/kvarovi').then((response) => asArray(response.data)), [])
  useLiveRefresh(faults.refresh)

  useEffect(() => {
    document.title = `${t('worker.title')} · ${t('app.name')}`
  }, [t])

  const list = faults.data || []
  const open = list.filter((fault) => fault.status !== 'Riješeno')
  const resolved = list.filter((fault) => fault.status === 'Riješeno')
  const shown = tab === 'open' ? open : resolved
  const tabs = [
    { id: 'open', label: t('worker.tabOpen'), count: open.length },
    { id: 'resolved', label: t('worker.tabResolved'), count: resolved.length },
  ]

  return (
    <div>
      <h1 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.01em] text-ink">{t('worker.title')}</h1>

      <div role="tablist" aria-label={t('worker.title')} className="pill-track mt-4">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="worker-panel"
            onClick={() => setParams(item.id === 'resolved' ? { pregled: 'rijeseni' } : {}, { replace: true })}
            className="pill-tab"
          >
            {item.label}
            <span className="tabular">({faults.loading && !faults.data ? '·' : item.count})</span>
          </button>
        ))}
      </div>

      <div id="worker-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="surface mt-4 overflow-hidden">
        {faults.loading && !faults.data ? (
          <LoadingRows rows={3} />
        ) : faults.error ? (
          <ErrorState error={faults.error} onRetry={faults.reload} />
        ) : shown.length === 0 ? (
          tab === 'open'
            ? <EmptyState icon={ClipboardList} title={t('worker.emptyOpenTitle')} body={t('worker.emptyOpenBody')} />
            : <EmptyState icon={CheckCircle2} title={t('worker.emptyResolvedTitle')} body={t('worker.emptyResolvedBody')} />
        ) : (
          <ul className="divide-y divide-rule">
            {shown.map((fault) => (
              <li key={fault.id}>
                <FaultRow fault={fault} to={`/radnik/kvar/${fault.id}`} updated={isUpdated(user?.id, fault)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
