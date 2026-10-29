import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ListChecks, Pencil, Power, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useLiveRefresh } from '../../lib/live'
import { useI18n } from '../../i18n'
import { useToast } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import FaultRow from '../../components/FaultRow'
import { ErrorState, LoadingRows } from '../../components/ui/States'
import { LabelFields } from '../../components/ui/Marks'
import { ActiveBadge, ComponentDialog, Identifier, QrPanel } from '../../components/assets'

const HISTORY_ROWS = 10

/** One component of a machine: identity, QR label, its open faults and recent history. */
export default function ComponentDetail() {
  const { id, kid } = useParams()
  const navigate = useNavigate()
  const i18n = useI18n()
  const { t, format } = i18n
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(null) // null | 'deactivate' | 'delete'
  const component = useAsync(() => api.get(`/oprema/komponente/${kid}`).then((response) => response.data), [kid])
  const open = useAsync(() => api.get('/kvarovi', { params: { komponenta: kid, status: 'otvoreni', sort: 'rizik' } }).then((response) => asArray(response.data)), [kid])
  const history = useAsync(() => api.get('/kvarovi', { params: { komponenta: kid, status: 'Riješeno', sort: 'rijeseno', limit: HISTORY_ROWS } }).then((response) => asArray(response.data)), [kid])
  useLiveRefresh(() => {
    open.refresh()
    history.refresh()
    component.refresh()
  })

  useEffect(() => {
    if (component.data) document.title = `${component.data.naziv} · ${t('app.name')}`
  }, [component.data, t])

  if (component.loading && !component.data) return <div className="surface"><LoadingRows rows={5} /></div>
  if (component.error) return <div className="surface"><ErrorState error={component.error} onRetry={component.reload} /></div>
  const c = component.data
  // The URL names the machine too; a component of another machine is shown under its own machine.
  const machineId = c.oprema?.id ?? id

  const setActive = async (aktivna) => {
    try {
      await api.put(`/oprema/komponente/${c.id}`, { aktivna })
      toast.success(aktivna ? t('assets.componentActivated') : t('assets.componentDeactivated'))
      component.reload()
    } catch (error) {
      toast.error(errorMessage(error, i18n))
      throw error
    }
  }

  const remove = async () => {
    try {
      await api.delete(`/oprema/komponente/${c.id}`)
      toast.success(t('assets.componentDeleted'))
      navigate(`/admin/oprema/${machineId}`, { replace: true })
    } catch (error) {
      toast.error(errorMessage(error, i18n))
      throw error
    }
  }

  const faultList = (state, emptyKey) => (state.loading && !state.data ? <LoadingRows rows={2} />
    : state.error ? <ErrorState error={state.error} onRetry={state.reload} />
      : state.data.length === 0 ? <p className="px-4 py-4 text-ink-2 sm:px-5">{t(emptyKey)}</p>
        : <ul className="divide-y divide-rule">{state.data.map((fault) => <li key={fault.id}><FaultRow fault={fault} to={`/admin/kvarovi/${fault.id}`} /></li>)}</ul>)

  return (
    <div>
      <nav aria-label={t('assets.breadcrumb')} className="mb-4 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink-2">
        <Link to={`/admin/oprema/${machineId}`} className="inline-flex items-center gap-1.5 hover:text-ink">
          <ArrowLeft size={17} aria-hidden="true" /> {c.oprema?.naziv || t('assets.machine')}
        </Link>
      </nav>

      <header className="surface mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-meta font-semibold uppercase tracking-wide text-ink-3">{t('assets.componentOf', { machine: c.oprema?.naziv || '' })}</p>
            <h1 className="break-words text-2xl font-semibold leading-tight text-ink">{c.naziv}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ActiveBadge active={c.aktivna} />
              <span className="text-sm text-ink-2">{[c.model, c.proizvodac].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/admin/kvarovi?oprema=${machineId}&komponenta=${c.id}`} className="btn-secondary">
              <ListChecks size={17} aria-hidden="true" /> {t('assets.allComponentFaults', { n: c.ukupno_kvarova })}
            </Link>
            <button type="button" className="btn-secondary" onClick={() => setEditing(true)}><Pencil size={17} aria-hidden="true" /> {t('common.edit')}</button>
            {c.aktivna ? (
              <button type="button" className="btn-secondary" onClick={() => setConfirm('deactivate')}><Power size={17} aria-hidden="true" /> {t('assets.deactivate')}</button>
            ) : (
              <button type="button" className="btn-secondary" onClick={() => setActive(true).catch(() => {})}><Power size={17} aria-hidden="true" /> {t('assets.activate')}</button>
            )}
            {/* Deleting is only for a component entered by mistake: one with fault history is kept. */}
            {c.ukupno_kvarova === 0 && (
              <button type="button" className="btn-icon hover:bg-urgent-wash hover:text-urgent" aria-label={`${t('assets.deleteComponent')}: ${c.naziv}`} onClick={() => setConfirm('delete')}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <LabelFields
            items={[
              { label: t('assets.machine'), value: c.oprema?.naziv },
              { label: t('machines.model'), value: c.model || '—' },
              { label: t('machines.manufacturer'), value: c.proizvodac || '—' },
              { label: t('assets.inventory'), value: <Identifier value={c.inventurni_broj} /> },
              { label: t('machines.serial'), value: <Identifier value={c.serijski_broj} /> },
              { label: t('assets.activeFaults'), value: c.aktivni_kvarovi },
              { label: t('assets.totalFaults'), value: c.ukupno_kvarova },
              { label: t('assets.updated'), value: format.dateShort(c.azurirano || c.kreiran) },
            ]}
          />
          {c.opis && <p className="mt-3 max-w-[75ch] whitespace-pre-wrap text-ink-2">{c.opis}</p>}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <section aria-labelledby="open-heading" className="surface overflow-hidden">
            <h2 id="open-heading" className="border-b border-rule px-4 py-3 font-semibold sm:px-5">{t('assets.openFaults')}</h2>
            {faultList(open, 'assets.noOpenFaults')}
          </section>
          <section aria-labelledby="history-heading" className="surface overflow-hidden">
            <h2 id="history-heading" className="border-b border-rule px-4 py-3 font-semibold sm:px-5">{t('assets.recentHistory')}</h2>
            {faultList(history, 'assets.noHistory')}
          </section>
        </div>
        <QrPanel
          oznaka={c.qr_oznaka}
          labelPath={`/oprema/komponente/${c.id}/qr-oznaka.pdf`}
          labelFile="adix-paper-qr-komponenta.pdf"
          renewPath={`/oprema/komponente/${c.id}/nova-qr-oznaka`}
          onRenewed={() => component.reload()}
        />
      </div>

      {editing && (
        <ComponentDialog
          machineId={machineId}
          component={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            toast.success(t('assets.componentSaved'))
            setEditing(false)
            component.reload()
          }}
        />
      )}
      {confirm === 'deactivate' && (
        <ConfirmDialog
          title={t('assets.deactivateTitle')}
          body={t('assets.deactivateBody', { name: c.naziv })}
          confirmLabel={t('assets.deactivate')}
          onConfirm={() => setActive(false)}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          title={t('assets.deleteTitle')}
          body={t('assets.deleteBody', { name: c.naziv })}
          confirmLabel={t('assets.deleteComponent')}
          onConfirm={remove}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
