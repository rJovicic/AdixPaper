import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ClipboardList, Download, FileSpreadsheet, FileText, RotateCw, Search, SearchX } from 'lucide-react'
import { api, downloadFile, errorMessage } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { byRisk, OPEN_STATUSES } from '../../lib/sla'
import { useI18n } from '../../i18n'
import { useToast } from '../../components/ui/Toast'
import Menu from '../../components/ui/Menu'
import FaultCard from '../../components/FaultCard'
import { DueTag, FaultNumber, PriorityMark, StatusMark } from '../../components/ui/Marks'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../../components/ui/States'

const PAGE = 50
const STATUSES = ['Novo', 'U rješavanju', 'Na čekanju', 'Riješeno']
const PRIORITIES = ['Hitno', 'Normalno', 'Nisko']

export default function Faults() {
  const i18n = useI18n()
  const { t, format, status: statusLabel, priority: priorityLabel } = i18n
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [limit, setLimit] = useState(PAGE)
  const filters = {
    q: params.get('q') || '',
    status: params.get('status') || '',
    prioritet: params.get('prioritet') || '',
    sla: params.get('sla') || '',
    sort: params.get('sort') || 'novo',
  }

  // Server-side filters; "otvoreni" (all open states) is applied in the browser.
  const serverQuery = useMemo(() => {
    const query = new URLSearchParams()
    if (filters.status && filters.status !== 'otvoreni') query.set('status', filters.status)
    if (filters.prioritet) query.set('prioritet', filters.prioritet)
    if (filters.sla) query.set('sla', filters.sla)
    return query.toString()
  }, [filters.status, filters.prioritet, filters.sla])

  const faults = useAsync(() => api.get(`/kvarovi${serverQuery ? `?${serverQuery}` : ''}`).then((response) => asArray(response.data)), [serverQuery])

  useEffect(() => {
    document.title = `${t('faults.title')} · ${t('app.name')}`
  }, [t])
  useEffect(() => setLimit(PAGE), [serverQuery, filters.q, filters.sort])

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase().replace(/^#/, '')
    let list = faults.data || []
    if (filters.status === 'otvoreni') list = list.filter((fault) => OPEN_STATUSES.includes(fault.status))
    if (q) {
      list = list.filter((fault) =>
        String(fault.id) === q ||
        `${fault.naslov} ${fault.oprema?.naziv || ''} ${fault.komponenta?.naziv || ''}`.toLowerCase().includes(q))
    }
    return filters.sort === 'rizik' ? [...list].sort(byRisk) : list
  }, [faults.data, filters.q, filters.status, filters.sort])

  const hasFilters = Boolean(filters.q || filters.status || filters.prioritet || filters.sla)

  const exportFile = async (path, filename) => {
    try {
      await downloadFile(`${path}${serverQuery ? `?${serverQuery}` : ''}`, filename)
    } catch (error) {
      toast.error(`${t('faults.exportFailed')} ${errorMessage(error, i18n)}`)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('faults.title')}
        meta={faults.data ? t('common.results', { n: rows.length }) : ' '}
        actions={
          <>
            <button type="button" onClick={faults.reload} disabled={faults.loading} className="btn-secondary" aria-label={t('common.refresh')}>
              <RotateCw size={17} aria-hidden="true" className={faults.loading ? 'animate-spin motion-reduce:animate-none' : ''} />
              <span className="hidden sm:inline">{t('common.refresh')}</span>
            </button>
            <Menu
              label={t('faults.export')}
              icon={Download}
              note={t('faults.exportHint')}
              items={[
                { label: t('faults.exportXlsx'), icon: FileSpreadsheet, onSelect: () => exportFile('/kvarovi/export.xlsx', 'adix-paper-kvarovi.xlsx') },
                { label: t('faults.exportParts'), icon: FileSpreadsheet, onSelect: () => exportFile('/kvarovi/export-dijelovi.xlsx', 'adix-paper-utroseni-dijelovi.xlsx') },
                { label: t('faults.exportPdf'), icon: FileText, onSelect: () => exportFile('/kvarovi/export.pdf', 'adix-paper-kvarovi.pdf') },
              ]}
            />
          </>
        }
      />

      <div className="surface mb-4 grid grid-cols-2 gap-2 p-3 sm:gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <div className="relative col-span-2 lg:col-span-1">
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            className="control pl-9"
            aria-label={t('common.search')}
            placeholder={t('faults.searchPlaceholder')}
            value={filters.q}
            onChange={(event) => setFilter('q', event.target.value)}
          />
        </div>
        <select className="control" aria-label={t('faults.status')} value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
          <option value="">{t('faults.allStatuses')}</option>
          <option value="otvoreni">{t('faults.openStatuses')}</option>
          {STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
        </select>
        <select className="control" aria-label={t('faults.priority')} value={filters.prioritet} onChange={(event) => setFilter('prioritet', event.target.value)}>
          <option value="">{t('faults.allPriorities')}</option>
          {PRIORITIES.map((value) => <option key={value} value={value}>{priorityLabel(value)}</option>)}
        </select>
        <select className="control" aria-label={t('faults.sla')} value={filters.sla} onChange={(event) => setFilter('sla', event.target.value)}>
          <option value="">{t('faults.allSla')}</option>
          <option value="kasni">{t('sla.filterLate')}</option>
          <option value="uskoro">{t('sla.filterSoon')}</option>
          <option value="ok">{t('sla.filterOk')}</option>
        </select>
        <select className="control" aria-label={t('faults.sort')} value={filters.sort} onChange={(event) => setFilter('sort', event.target.value === 'novo' ? '' : event.target.value)}>
          <option value="novo">{t('faults.sortNewest')}</option>
          <option value="rizik">{t('faults.sortRisk')}</option>
        </select>
      </div>

      {faults.loading && !faults.data ? (
        <div className="surface"><LoadingRows rows={6} /></div>
      ) : faults.error ? (
        <div className="surface"><ErrorState error={faults.error} onRetry={faults.reload} /></div>
      ) : rows.length === 0 ? (
        <div className="surface">
          {hasFilters ? (
            <EmptyState
              icon={SearchX}
              title={t('faults.noMatchTitle')}
              action={<button type="button" className="btn-secondary" onClick={() => setParams({}, { replace: true })}>{t('common.clearFilters')}</button>}
            />
          ) : (
            <EmptyState icon={ClipboardList} title={t('faults.emptyTitle')} body={t('faults.emptyBody')} />
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.slice(0, limit).map((fault) => (
              <li key={fault.id}><FaultCard fault={fault} to={`/admin/kvarovi/${fault.id}`} /></li>
            ))}
          </ul>

          <div className="surface hidden overflow-x-auto md:block">
            <table className="w-full text-[0.9375rem]">
              <thead className="table-head">
                <tr>
                  <th scope="col" className="w-20 px-4 py-2.5 font-semibold">#</th>
                  <th scope="col" className="w-[38%] px-4 py-2.5 font-semibold">{t('faults.colFault')}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t('fault.priority')}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t('fault.status')}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t('fault.due')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-semibold lg:table-cell">{t('fault.assignee')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-semibold xl:table-cell">{t('fault.reportedAt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.slice(0, limit).map((fault) => (
                  <tr
                    key={fault.id}
                    onClick={(event) => {
                      if (event.target.closest('a')) return
                      navigate(`/admin/kvarovi/${fault.id}`)
                    }}
                    className="cursor-pointer transition-colors hover:bg-brand-wash/50"
                  >
                    <td className="px-4 py-3 align-top"><FaultNumber id={fault.id} size="sm" /></td>
                    <td className="max-w-0 px-4 py-3">
                      <Link to={`/admin/kvarovi/${fault.id}`} className="block truncate font-semibold text-ink hover:underline">{fault.naslov}</Link>
                      <span className="block truncate text-meta text-ink-2">{[fault.oprema?.naziv, fault.komponenta?.naziv].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="px-4 py-3"><PriorityMark priority={fault.prioritet} /></td>
                    <td className="px-4 py-3"><StatusMark status={fault.status} /></td>
                    <td className="px-4 py-3">{fault.status === 'Riješeno' ? <span className="text-ink-3">—</span> : <DueTag fault={fault} />}</td>
                    <td className="hidden max-w-[11rem] truncate px-4 py-3 text-ink-2 lg:table-cell">
                      {fault.voditelj ? `${fault.voditelj.ime} ${fault.voditelj.prezime}` : '—'}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-ink-2 tabular xl:table-cell">{format.dateShort(fault.datum_prijave)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > limit && (
            <div className="mt-4 flex justify-center">
              <button type="button" className="btn-secondary" onClick={() => setLimit((value) => value + PAGE)}>
                {t('common.showMore', { n: Math.min(PAGE, rows.length - limit) })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
