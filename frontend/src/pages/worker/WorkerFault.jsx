import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, SearchX } from 'lucide-react'
import { api, errorKind } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useLiveRefresh } from '../../lib/live'
import { useI18n } from '../../i18n'
import Timeline from '../../components/Timeline'
import Photos from '../../components/Photos'
import { useAuth } from '../../auth/AuthProvider'
import { markSeen } from '../../lib/seen'
import { DueTag, FaultNumber, LabelFields, PriorityMark, PriorityTile, StatusMark, WaitingTag } from '../../components/ui/Marks'
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/States'

export default function WorkerFault() {
  const { id } = useParams()
  const { t, format } = useI18n()
  const fault = useAsync(() => api.get(`/kvarovi/${id}`).then((response) => response.data), [id])
  const events = useAsync(() => api.get(`/kvarovi/${id}/dogadjaji`).then((response) => asArray(response.data)), [id])

  const sameFault = (message) => message.kvarId === Number(id)
  useLiveRefresh(fault.refresh, sameFault)
  useLiveRefresh(events.refresh, sameFault)

  const { user } = useAuth()
  useEffect(() => {
    if (fault.data) markSeen(user?.id, fault.data.id)
  }, [fault.data, user?.id])

  useEffect(() => {
    if (fault.data) document.title = `${t('fault.number', { id: fault.data.id })} · ${t('app.name')}`
  }, [fault.data, t])

  const back = (
    <Link to="/radnik" className="btn-quiet -ml-3 mb-2">
      <ArrowLeft size={18} aria-hidden="true" />
      {t('fault.backToMine')}
    </Link>
  )

  if (fault.loading && !fault.data) return <div>{back}<div className="surface"><LoadingRows rows={4} /></div></div>
  if (fault.error) {
    return (
      <div>
        {back}
        <div className="surface">
          {errorKind(fault.error) === 'notFound'
            ? <EmptyState icon={SearchX} title={t('fault.notFoundTitle')} body={t('errors.notFound')} />
            : <ErrorState error={fault.error} onRetry={fault.reload} />}
        </div>
      </div>
    )
  }

  const item = fault.data
  const resolved = item.status === 'Riješeno'

  return (
    <div className="space-y-5">
      <div>
        {back}
        <article className="surface overflow-hidden">
          <header className="flex gap-3.5 border-b border-rule px-4 py-4 sm:px-5">
            <PriorityTile priority={item.prioritet} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-baseline gap-2 text-sm font-semibold text-ink-2">
                <span className="truncate">{item.oprema?.naziv}</span>
                <FaultNumber id={item.id} size="sm" className="shrink-0 text-base" />
              </p>
              <h1 className="mt-0.5 text-xl font-semibold leading-snug">{item.naslov}</h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <PriorityMark priority={item.prioritet} />
                <StatusMark status={item.status} />
                <DueTag fault={item} className="ml-1" />
                <WaitingTag fault={item} />
              </div>
            </div>
          </header>
          <LabelFields
            columns="sm:grid-cols-2"
            items={[
              { label: t('fault.machine'), value: item.oprema?.naziv },
              { label: t('fault.component'), value: item.komponenta?.naziv || t('fault.componentGeneral') },
              { label: t('fault.reportedAt'), value: format.dateTime(item.datum_prijave) },
              { label: t('fault.assignee'), value: item.voditelj ? `${item.voditelj.ime} ${item.voditelj.prezime}` : t('worker.waiting') },
              resolved && { label: t('fault.resolvedAt'), value: format.dateTime(item.datum_rjesavanja), wide: true },
            ]}
          />
          <div className="px-4 py-4 sm:px-5">
            <h2 className="field-label">{t('fault.description')}</h2>
            <p className="mt-1 whitespace-pre-wrap break-words text-ink">{item.opis || <span className="text-ink-3">{t('fault.noDescription')}</span>}</p>
          </div>
          <Photos
            faultId={item.id}
            canAdd={!resolved}
            canDelete={(photo) => !resolved && photo.korisnik?.id === user?.id}
            onChanged={events.reload}
            className="border-t border-rule px-5 py-4"
          />
          {resolved && item.sto_je_uradjeno && (
            <div className="border-t border-rule bg-brand-wash/60 px-5 py-4">
              <h2 className="field-label">{t('fault.workDone')}</h2>
              <p className="mt-1 whitespace-pre-wrap break-words text-ink">{item.sto_je_uradjeno}</p>
            </div>
          )}
        </article>
      </div>

      {events.error ? (
        <div className="surface"><ErrorState error={events.error} onRetry={events.reload} /></div>
      ) : (
        <Timeline faultId={item.id} events={events.data || []} onAdded={events.reload} />
      )}
    </div>
  )
}
