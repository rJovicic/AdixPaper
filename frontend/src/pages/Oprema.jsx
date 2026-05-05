import { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, X } from 'lucide-react'
import api from '../api/axios'

const STATUS_BADGE = {
  'Aktivno': 'badge-green',
  'Neispravno': 'badge-red',
  'Na servisu': 'badge-yellow',
  'Raspisano': 'badge-blue',
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export default function Oprema() {
  const [oprema, setOprema] = useState([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [form, setForm] = useState({ naziv: '', tip: '', tvrtka: 'Cupup d.o.o', proizvodac: '', model: '', serijski_broj: '', lokacija: '', status: 'Aktivno' })
  const [components, setComponents] = useState([])
  const [newComponent, setNewComponent] = useState('')

  const load = () => api.get(`/oprema${search ? `?search=${search}` : ''}`).then(r => setOprema(Array.isArray(r.data) ? r.data : []))
  useEffect(() => { load() }, [])
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [search])

  const saveOprema = async () => {
    try {
      if (showEdit) await api.put(`/oprema/${showEdit.id}`, form)
      else await api.post('/oprema', form)
      load(); setShowAdd(false); setShowEdit(null)
    } catch (e) { alert(e.response?.data?.detail || 'Greška') }
  }

  const loadComponents = (opremaId) => {
    if (!opremaId) {
      setComponents([])
      return
    }
    api.get(`/oprema/${opremaId}/komponente`)
      .then(r => setComponents(Array.isArray(r.data) ? r.data : []))
      .catch(() => setComponents([]))
  }

  const addComponent = async () => {
    const naziv = newComponent.trim()
    if (!showEdit || !naziv) return
    await api.post(`/oprema/${showEdit.id}/komponente`, { naziv, aktivna: true })
    setNewComponent('')
    loadComponents(showEdit.id)
  }

  const toggleComponent = async (component) => {
    await api.put(`/oprema/komponente/${component.id}`, { aktivna: !component.aktivna })
    loadComponents(showEdit.id)
  }

  const deleteOprema = async (id, naziv) => {
    if (!confirm(`Obrisati opremu "${naziv}"?`)) return
    await api.delete(`/oprema/${id}`); load()
  }

  const OpremaForm = ({ data, onChange }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[['naziv', 'Naziv *'], ['tip', 'Tip *'], ['proizvodac', 'Proizvođač'], ['model', 'Model'], ['serijski_broj', 'Serijski broj'], ['lokacija', 'Lokacija']].map(([k, l]) => (
        <div key={k}>
          <label className="label">{l}</label>
          <input className="input" value={data[k] || ''} onChange={e => onChange({ ...data, [k]: e.target.value })} />
        </div>
      ))}
      <div>
        <label className="label">Tvrtka</label>
        <select className="input" value={data.tvrtka || ''} onChange={e => onChange({ ...data, tvrtka: e.target.value })}>
          <option>Cupup d.o.o</option>
          <option>Delt papir d.o.o</option>
        </select>
      </div>
      <div>
        <label className="label">Status</label>
        <select className="input" value={data.status || 'Aktivno'} onChange={e => onChange({ ...data, status: e.target.value })}>
          {['Aktivno', 'Neispravno', 'Na servisu', 'Raspisano'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Oprema</h1>
          <p className="text-gray-500 text-sm">{oprema.length} uređaja</p>
        </div>
        <button onClick={() => { setForm({ naziv: '', tip: '', tvrtka: 'Cupup d.o.o', proizvodac: '', model: '', serijski_broj: '', lokacija: '', status: 'Aktivno' }); setShowAdd(true) }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Dodaj opremu
        </button>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-10" placeholder="Pretraži opremu..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['ID', 'Naziv', 'Tip', 'Tvrtka', 'Lokacija', 'Status', 'Kvarovi', 'Troškovi', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-gray-600 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {oprema.map(o => (
              <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-400">#{o.id}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{o.naziv}</td>
                <td className="px-4 py-3 text-gray-600">{o.tip}</td>
                <td className="px-4 py-3 text-gray-600">{o.tvrtka || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{o.lokacija || '—'}</td>
                <td className="px-4 py-3"><span className={STATUS_BADGE[o.status] || 'badge-blue'}>{o.status}</span></td>
                <td className="px-4 py-3 text-gray-600">{o.broj_kvarova}</td>
                <td className="px-4 py-3 text-gray-600">{(o.ukupni_troskovi || 0).toFixed(2)} €</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setForm(o); setShowEdit(o); loadComponents(o.id) }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Uredi"><Edit2 size={16} /></button>
                    <button onClick={() => deleteOprema(o.id, o.naziv)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="Obriši"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {oprema.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">Nema opreme</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(showAdd || showEdit) && (
        <Modal title={showEdit ? `Uredi: ${showEdit.naziv}` : 'Dodaj novu opremu'} onClose={() => { setShowAdd(false); setShowEdit(null) }}>
          <OpremaForm data={form} onChange={setForm} />
          {showEdit && (
            <div className="mt-6 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <h3 className="mb-3 font-semibold text-gray-800">Komponente / podsklopovi</h3>
              <div className="mb-3 flex gap-2">
                <input className="input" value={newComponent} onChange={e => setNewComponent(e.target.value)} placeholder="npr. Transporter, nož, senzor..." />
                <button onClick={addComponent} className="btn-secondary whitespace-nowrap">Dodaj</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {components.map(component => (
                  <button
                    key={component.id}
                    onClick={() => toggleComponent(component)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${component.aktivna ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400 line-through'}`}
                    title={component.aktivna ? 'Klik za deaktivaciju' : 'Klik za aktivaciju'}
                  >
                    {component.naziv}
                  </button>
                ))}
                {components.length === 0 && <p className="text-sm text-gray-400">Nema unesenih komponenti za ovu opremu.</p>}
              </div>
            </div>
          )}
          <div className="flex gap-3 mt-6">
            <button onClick={saveOprema} className="btn-primary">Spremi</button>
            <button onClick={() => { setShowAdd(false); setShowEdit(null) }} className="btn-secondary">Odustani</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
