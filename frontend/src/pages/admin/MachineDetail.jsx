import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, ChevronRight, ListChecks, Pencil, Plus, Puzzle, QrCode, Search, SearchX } from 'lucide-react'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useLiveRefresh } from '../../lib/live'
import { useI18n } from '../../i18n'
import { useToast } from '../../components/ui/Toast'
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/States'
import { LabelFields } from '../../components/ui/Marks'
import { ActiveBadge, ComponentDialog, Identifier, MachineStatus, QrPanel, useLabels } from '../../components/assets'
import { MachineDialog } from './Machines'

/**
 * One production line: its own details, its components (searchable, compact), labels for the
 * whole line, and the way to its faults. Components open their own page.
 */
export default function MachineDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const i18n = useI18n()
  const { t, format } = i18n
  const toast = useToast()
  const labels = useLabels()
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editingMachine, setEditingMachine] = useState(false)
  const [addingComponent, setAddingComponent] = useState(false)
  const machine = useAsync(() => api.get(`/oprema/${id}`).then((response) => response.data), [id])
  const components = useAsync(() => api.get(`/oprema/${id}/komponente`).then((response) => asArray(response.data)), [id])
  const justCreated = params.get('nova') === '1'
  useLiveRefresh(() => {
    machine.refresh()
    components.refresh()
  })

  useEffect(() => {
    if (machine.data) document.title = `${machine.data.naziv} · ${t('app.name')}`
  }, [machine.data, t])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (components.data || []).filter((item) => (showInactive || item.aktivna)
      && (!q || [item.naziv, item.model, item.proizvodac, item.inventurni_broj, item.serijski_broj].filter(Boolean).join(' ').toLowerCase().includes(q)))
  }, [components.data, query, showInactive])
  const inactiveCount = (components.data || []).filter((item) => !item.aktivna).length

  if (machine.loading && !machine.data) return <div className="surface"><LoadingRows rows={5} /></div>
  if (machine.error) return <div className="surface"><ErrorState error={machine.error} onRetry={machine.reload} /></div>
  const m = machine.data

  return (
    <div>
      {labels.dialog}
      <Link to="/admin/oprema" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft size={17} aria-hidden="true" /> {t('assets.allMachines')}
      </Link>

      {justCreated && (
        <div role="status" className="mb-4 flex flex-col gap-3 rounded border border-brand/30 bg-brand-wash px-4 py-3.5 sm:flex-row sm:items-center">
          <p className="flex-1 text-[0.9375rem] text-ink"><span className="font-semibold">{t('machines.qrCreatedTitle')}</span> {t('assets.createdBody')}</p>
          <button type="button" className="btn-secondary shrink-0" onClick={() => setParams({}, { replace: true })}>{t('common.close')}</button>
        </div>
      )}

      <header className="surface mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-meta font-semibold uppercase tracking-wide text-ink-3">{t('assets.machine')}</p>
            <h1 className="break-words text-2xl font-semibold leading-tight text-ink">{m.naziv}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <MachineStatus status={m.status} />
              <span className="text-sm text-ink-2">{t('assets.componentsCount', { n: m.broj_komponenti })}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/admin/kvarovi?oprema=${m.id}`} className="btn-secondary">
              <ListChecks size={17} aria-hidden="true" /> {t('assets.machineFaults', { n: m.aktivni_kvarovi })}
            </Link>
            <button type="button" className="btn-secondary" disabled={labels.busy} onClick={() => labels.download(`/oprema/${m.id}/qr-oznake.pdf`, 'adix-paper-qr-oznake-masine.pdf')}>
              <QrCode size={17} aria-hidden="true" /> {t('assets.labelsMachine')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditingMachine(true)}>
              <Pencil size={17} aria-hidden="true" /> {t('common.edit')}
            </button>
          </div>
        </div>
        <div className="mt-4">
          <LabelFields
            items={[
              { label: t('machines.manufacturer'), value: m.proizvodac || '—' },
              { label: t('machines.model'), value: m.model || '—' },
              { label: t('assets.inventory'), value: <Identifier value={m.inventurni_broj} /> },
              { label: t('machines.serial'), value: <Identifier value={m.serijski_broj} /> },
              { label: t('machines.location'), value: m.lokacija || '—' },
              { label: t('assets.urgentFaults'), value: m.hitni_kvarovi },
              { label: t('machines.cost'), value: format.money(m.ukupni_troskovi) },
              { label: t('assets.updated'), value: m.azurirano ? format.dateShort(m.azurirano) : format.dateShort(m.kreiran) },
            ]}
          />
          {m.napomene && <p className="mt-3 max-w-[75ch] whitespace-pre-wrap text-ink-2">{m.napomene}</p>}
        </div>
      </header>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="components-heading" className="surface overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3 sm:px-5">
            <h2 id="components-heading" className="flex-1 font-semibold">{t('assets.components')}</h2>
            <button type="button" className="btn-primary" onClick={() => setAddingComponent(true)}><Plus size={17} aria-hidden="true" /> {t('assets.addComponent')}</button>
          </div>
          <div className="flex flex-col gap-3 border-b border-rule px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <div className="relative flex-1">
              <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input type="search" className="control pl-9" aria-label={t('assets.searchComponents')} placeholder={t('assets.searchComponents')} value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            {inactiveCount > 0 && (
              <label className="inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="h-5 w-5 accent-[rgb(var(--brand))]" />
                {t('assets.showInactive', { n: inactiveCount })}
              </label>
            )}
          </div>
          {components.loading && !components.data ? (
            <LoadingRows rows={4} />
          ) : components.error ? (
            <ErrorState error={components.error} onRetry={components.reload} />
          ) : list.length === 0 ? (
            query
              ? <EmptyState icon={SearchX} title={t('assets.noComponentMatch')} action={<button type="button" className="btn-secondary" onClick={() => setQuery('')}>{t('common.clearFilters')}</button>} />
              : <EmptyState icon={Puzzle} title={t('assets.noComponentsTitle')} body={t('assets.noComponentsBody')} />
          ) : (
            <>
              <ul className="divide-y divide-rule md:hidden">
                {list.map((item) => (
                  <li key={item.id}>
                    <Link to={`/admin/oprema/${m.id}/komponente/${item.id}`} className={`flex items-center gap-3 px-4 py-3 ${item.aktivna ? '' : 'bg-ground/50'}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold text-ink">{item.naziv}</span>
                        <span className="block break-words text-meta text-ink-2">{[item.model, item.proizvodac].filter(Boolean).join(' · ') || '—'}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-2">
                          {!item.aktivna && <ActiveBadge active={false} />}
                          <span>{t('assets.activeFaults')}: <span className={`numeral ${item.aktivni_kvarovi ? 'text-ink' : ''}`}>{item.aktivni_kvarovi}</span></span>
                        </span>
                      </span>
                      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-ink-3" />
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-[0.9375rem]">
                  <thead className="table-head">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-semibold">{t('assets.componentName')}</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">{t('machines.model')} · {t('machines.manufacturer')}</th>
                      <th scope="col" className="hidden whitespace-nowrap px-4 py-2.5 font-semibold lg:table-cell">{t('assets.inventory')}</th>
                      <th scope="col" className="hidden whitespace-nowrap px-4 py-2.5 font-semibold lg:table-cell">{t('machines.serial')}</th>
                      <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">{t('assets.activeFaults')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {list.map((item) => (
                      <tr key={item.id} className={`cursor-pointer ${item.aktivna ? 'hover:bg-ground/40' : 'bg-ground/50 text-ink-2'}`} onClick={() => navigate(`/admin/oprema/${m.id}/komponente/${item.id}`)}>
                        <td className="px-4 py-2.5">
                          <Link to={`/admin/oprema/${m.id}/komponente/${item.id}`} className="link font-semibold text-ink" onClick={(event) => event.stopPropagation()}>{item.naziv}</Link>
                          {!item.aktivna && <span className="ml-2 align-middle"><ActiveBadge active={false} /></span>}
                        </td>
                        <td className="px-4 py-2.5 text-ink-2">{[item.model, item.proizvodac].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="hidden whitespace-nowrap px-4 py-2.5 text-sm lg:table-cell"><Identifier value={item.inventurni_broj} /></td>
                        <td className="hidden whitespace-nowrap px-4 py-2.5 text-sm lg:table-cell"><Identifier value={item.serijski_broj} /></td>
                        <td className={`px-4 py-2.5 text-right numeral ${item.aktivni_kvarovi ? 'font-semibold text-ink' : 'text-ink-3'}`}>{item.aktivni_kvarovi}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <QrPanel
          oznaka={m.qr_oznaka}
          labelPath={`/oprema/qr-oznake.pdf?ids=${m.id}`}
          labelFile="adix-paper-qr-masina.pdf"
          renewPath={`/oprema/${m.id}/nova-qr-oznaka`}
          onRenewed={() => machine.reload()}
        />
      </div>

      {editingMachine && (
        <MachineDialog
          machine={m}
          onClose={() => setEditingMachine(false)}
          onSaved={() => {
            toast.success(t('machines.saved'))
            setEditingMachine(false)
            machine.reload()
          }}
        />
      )}
      {addingComponent && (
        <ComponentDialog
          machineId={m.id}
          onClose={() => setAddingComponent(false)}
          onSaved={() => {
            toast.success(t('assets.componentSaved'))
            setAddingComponent(false)
            components.reload()
            machine.refresh()
          }}
        />
      )}
    </div>
  )
}
