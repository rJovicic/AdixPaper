import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { CheckCircle2, ClipboardList, Plus } from 'lucide-react'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useI18n } from '../../i18n'
import FaultCard from '../../components/FaultCard'
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/States'

export default function MyFaults() {
  const { t } = useI18n()
  const location = useLocation()
  const newId = location.state?.newId
  const [tab, setTab] = useState('open')
  const faults = useAsync(() => api.get('/kvarovi').then((response) => asArray(response.data)), [])

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
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">{t('worker.title')}</h1>

      <Link to="/radnik/prijava" className="btn-primary btn-lg mt-4 w-full text-[1.0625rem]">
        <Plus size={22} strokeWidth={2.5} aria-hidden="true" />
        {t('worker.report')}
      </Link>

      <div role="tablist" aria-label={t('worker.title')} className="mt-6 flex border-b border-rule">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="worker-panel"
            onClick={() => setTab(item.id)}
            className={`-mb-px flex min-h-[2.75rem] items-center gap-2 border-b-2 px-4 font-semibold transition-colors ${
              tab === item.id ? 'border-brand text-ink' : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {item.label}
            <span className="numeral rounded-sm bg-ground px-1.5 text-sm text-ink-2">{faults.loading ? '·' : item.count}</span>
          </button>
        ))}
      </div>

      <div id="worker-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-4">
        {faults.loading && !faults.data ? (
          <div className="surface"><LoadingRows rows={3} /></div>
        ) : faults.error ? (
          <div className="surface"><ErrorState error={faults.error} onRetry={faults.reload} /></div>
        ) : shown.length === 0 ? (
          <div className="surface">
            {tab === 'open'
              ? <EmptyState icon={ClipboardList} title={t('worker.emptyOpenTitle')} body={t('worker.emptyOpenBody')} />
              : <EmptyState icon={CheckCircle2} title={t('worker.emptyResolvedTitle')} body={t('worker.emptyResolvedBody')} />}
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((fault) => (
              <li key={fault.id}>
                <FaultCard fault={fault} to={`/radnik/kvar/${fault.id}`} highlight={fault.id === newId} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
