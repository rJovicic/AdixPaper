import { useEffect, useState } from 'react'
import { Search, Filter, Trash2, Eye, X } from 'lucide-react'
import api from '../api/axios'

const STATUS_BADGE = {
  'Završeno': 'badge-green',
  'U tijeku': 'badge-yellow',
  'Planirano': 'badge-blue',
}

function DetailModal({ record, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">Detalji održavanja #{record.id}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          {[
            ['Oprema', record.oprema_naziv],
            ['Datum', record.datum],
            ['Vrsta', record.vrsta_odrzavanja],
            ['Status', record.status],
            ['Izvođač', record.izvodioc_ime || '—'],
            ['Trajanje', record.trajanje ? `${record.trajanje} min` : '—'],
            ['Troškovi', `${parseFloat(record.troskovi || 0).toFixed(2)} €`],
            ['Opis', record.opis || '—'],
            ['Materijal', record.materijal || '—'],
            ['Napomene', record.napomene || '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="font-medium text-gray-600 w-28 flex-shrink-0">{k}:</span>
              <span className="text-gray-800">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Odrzavanje() {
  const [records, setRecords] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [detail, setDetail] = useState(null)

  const load = () => api.get(`/odrzavanje${statusFilter ? `?status=${statusFilter}` : ''}`).then(r => setRecords(Array.isArray(r.data) ? r.data : []))
  useEffect(() => { load() }, [statusFilter])

  const deleteRecord = async (id) => {
    if (!confirm('Obrisati zapis?')) return
    await api.delete(`/odrzavanje/${id}`); load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Evidencija održavanja</h1>
        <p className="text-gray-500 text-sm">{records.length} zapisa</p>
      </div>

      <div className="flex gap-3">
        <select className="input w-48" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Svi statusi</option>
          <option>Završeno</option>
          <option>U tijeku</option>
          <option>Planirano</option>
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['#', 'Oprema', 'Datum', 'Vrsta', 'Izvođač', 'Trajanje', 'Troškovi', 'Status', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-gray-600 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-400">{r.id}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{r.oprema_naziv || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.datum}</td>
                <td className="px-4 py-3 text-gray-600">{r.vrsta_odrzavanja}</td>
                <td className="px-4 py-3 text-gray-600">{r.izvodioc_ime || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.trajanje ? `${r.trajanje} min` : '—'}</td>
                <td className="px-4 py-3 text-gray-600">{parseFloat(r.troskovi || 0).toFixed(2)} €</td>
                <td className="px-4 py-3"><span className={STATUS_BADGE[r.status] || 'badge-blue'}>{r.status}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => setDetail(r)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Eye size={15} /></button>
                    <button onClick={() => deleteRecord(r.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">Nema zapisa</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && <DetailModal record={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
