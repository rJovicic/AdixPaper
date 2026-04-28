import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, FileText, Filter, RefreshCw } from 'lucide-react'
import api from '../api/axios'
import { SlaBadge } from '../utils/sla'
import { PrioritetBadge, StatusBadge } from './Dashboard'

export default function Kvarovi() {
  const [kvarovi, setKvarovi] = useState([])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPrioritet, setFilterPrioritet] = useState('')
  const [filterSla, setFilterSla] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const buildParams = () => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterPrioritet) params.set('prioritet', filterPrioritet)
    if (filterSla) params.set('sla', filterSla)
    return params
  }

  const load = () => {
    setLoading(true)
    const params = buildParams()
    api.get(`/kvarovi?${params}`)
      .then(r => setKvarovi(Array.isArray(r.data) ? r.data : []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filterStatus, filterPrioritet, filterSla])

  const fmt = (dt) => dt ? new Date(dt).toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'
  const downloadExport = async (format) => {
    const params = buildParams()
    const response = await api.get(`/kvarovi/export.${format}?${params}`, { responseType: 'blob' })
    const blob = new Blob([response.data])
    const href = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `adix-paper-kvarovi.${format}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(href)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kvarovi</h1>
          <p className="text-gray-500 text-sm">{kvarovi.length} zapisa</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => downloadExport('xlsx')} className="btn-secondary flex items-center gap-2">
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button onClick={() => downloadExport('pdf')} className="btn-secondary flex items-center gap-2">
            <FileText size={16} /> PDF
          </button>
          <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Osvježi
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Filter size={14} />
          <span>Filter:</span>
        </div>
        <select
          className="input py-1.5 text-sm w-auto"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">Svi statusi</option>
          <option value="Novo">Novo</option>
          <option value="U rješavanju">U rješavanju</option>
          <option value="Na čekanju">Na čekanju</option>
          <option value="Riješeno">Riješeno</option>
        </select>
        <select
          className="input py-1.5 text-sm w-auto"
          value={filterPrioritet}
          onChange={e => setFilterPrioritet(e.target.value)}
        >
          <option value="">Svi prioriteti</option>
          <option value="Hitno">Hitno</option>
          <option value="Normalno">Normalno</option>
          <option value="Nisko">Nisko</option>
        </select>
        <select
          className="input py-1.5 text-sm w-auto"
          value={filterSla}
          onChange={e => setFilterSla(e.target.value)}
        >
          <option value="">Svi SLA statusi</option>
          <option value="kasni">SLA kasni</option>
          <option value="uskoro">SLA uskoro ističe</option>
          <option value="ok">SLA u roku</option>
        </select>
        {(filterStatus || filterPrioritet || filterSla) && (
          <button onClick={() => { setFilterStatus(''); setFilterPrioritet(''); setFilterSla('') }} className="text-sm text-gray-500 hover:text-gray-700 underline">
            Očisti filtere
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        {kvarovi.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">Nema kvarova</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                  <th className="text-left px-4 py-3 font-medium">#</th>
                  <th className="text-left px-4 py-3 font-medium">Naslov</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Oprema</th>
                  <th className="text-left px-4 py-3 font-medium">Prior.</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">SLA</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Voditelj</th>
                  <th className="text-left px-4 py-3 font-medium hidden xl:table-cell">Prijavljeno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {kvarovi.map(k => (
                  <tr
                    key={k.id}
                    onClick={() => navigate(`/admin/kvarovi/${k.id}`)}
                    className="cursor-pointer hover:bg-blue-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-400">{k.id}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{k.naslov}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell max-w-[150px] truncate">{k.oprema?.naziv || '-'}</td>
                    <td className="px-4 py-3"><PrioritetBadge prioritet={k.prioritet} /></td>
                    <td className="px-4 py-3"><StatusBadge status={k.status} /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><SlaBadge kvar={k} /></td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                      {k.voditelj ? `${k.voditelj.ime} ${k.voditelj.prezime}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden xl:table-cell">{fmt(k.datum_prijave)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
