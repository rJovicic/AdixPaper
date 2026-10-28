import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { CheckCircle2, ClipboardList, Plus, QrCode } from 'lucide-react'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useI18n } from '../../i18n'
import FaultCard from '../../components/FaultCard'
import { useAuth } from '../../auth/AuthProvider'
import { isUpdated } from '../../lib/seen'
import { scanSupported } from '../../lib/qr'
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/States'

export default function MyFaults() {
  const { t } = useI18n()
  const location = useLocation()
  const newId = location.state?.newId
  const [tab, setTab] = useState('open')
  const { user } = useAuth()
  const canScan = scanSupported()
  const faults = useAsync(() => api.get('/kvarovi').then((response) => asArray(response.data)), [])

  // Workers keep this screen open to see whether someone is on it: refresh while visible.
  const { reload } = faults
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === 'visible' && reload(), 60_000)
    return () => clearInterval(timer)
  }, [reload])

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
      {user?.ime && <p className="text-ink-2">{t('worker.hello', { name: user.ime })}</p>}
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">{t('worker.title')}</h1>

      <div className={`mt-4 grid gap-3 ${canScan ? 'grid-cols-2' : ''}`}>
        <Link to="/radnik/prijava" className="group flex min-h-[6.5rem] flex-col justify-between gap-3 rounded-lg bg-brand p-4 text-stock shadow-label transition-colors hover:bg-brand-hover">
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-md bg-white/15">
            <Plus size={22} strokeWidth={2.5} />
          </span>
          <span>
            <span className="block text-[1.0625rem] font-semibold leading-tight">{t('worker.report')}</span>
            <span className="block text-meta text-stock/90">{t('worker.reportHint')}</span>
          </span>
        </Link>
        {canScan && (
          <Link to="/radnik/skeniraj" className="surface group flex min-h-[6.5rem] flex-col justify-between gap-3 p-4 transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-lift">
            <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-md bg-info-wash text-brand">
              <QrCode size={22} />
            </span>
            <span>
              <span className="block text-[1.0625rem] font-semibold leading-tight text-ink">{t('scan.tile')}</span>
              <span className="block text-meta text-ink-2">{t('scan.tileHint')}</span>
            </span>
          </Link>
        )}
      </div>
      {!canScan && (
        <p className="mt-2 flex items-center gap-1.5 text-meta text-ink-2">
          <QrCode size={15} aria-hidden="true" className="shrink-0" />
          {t('worker.qrHint')}
        </p>
      )}

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
            <span className="rounded-sm bg-[#E8EAED] px-1.5 py-0.5 text-xs font-semibold tabular text-ink-2">{faults.loading ? '·' : item.count}</span>
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
                <FaultCard fault={fault} to={`/radnik/kvar/${fault.id}`} highlight={fault.id === newId} updated={fault.id !== newId && isUpdated(user?.id, fault)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
