import { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, X, CheckCircle, AlertTriangle, Wrench } from 'lucide-react'
import api from '../api/axios'

const STATUS_BADGE = {
  'Aktivno': 'badge-green',
  'Neispravno': 'badge-red',
  'Na servisu': 'badge-yellow',
  'Raspisano': 'badge-blue',
}

const VRSTE = ['Redovno servisiranje', 'Popravak kvara', 'Elektro kvar', 'Preventivno održavanje', 'Godišnji servis', 'Ostalo']
const STATUSI_ODRZAVANJA = ['Završeno', 'U tijeku', 'Planirano']

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
  const [showOdrzavanje, setShowOdrzavanje] = useState(null)
  const [radnici, setRadnici] = useState([])
  const [form, setForm] = useState({ naziv: '', tip: '', tvrtka: 'Cupup d.o.o', proizvodac: '', model: '', serijski_broj: '', lokacija: '', status: 'Aktivno' })
  const [odrzForm, setOdrzForm] = useState({ oprema_id: null, datum: new Date().toISOString().slice(0, 10), vrsta_odrzavanja: 'Redovno servisiranje', opis: '', materijal: '', troskovi: '', trajanje: '', status: 'Završeno', napomene: '', izvodioc_id: '' })

  const load = () => api.get(`/oprema${search ? `?search=${search}` : ''}`).then(r => setOprema(r.data))
  useEffect(() => { load(); api.get('/korisnici/radnici/lista').then(r => setRadnici(r.data)) }, [])
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [search])

  const saveOprema = async () => {
    try {
      if (showEdit) await api.put(`/oprema/${showEdit.id}`, form)
      else await api.post('/oprema', form)
      load(); setShowAdd(false); setShowEdit(null)
    } catch (e) { alert(e.response?.data?.detail || 'Greška') }
  }

  const deleteOprema = async (id, naziv) => {
    if (!confirm(`Obrisati opremu "${naziv}"?`)) return
    await api.delete(`/oprema/${id}`); load()
  }

  const saveOdrzavanje = async () => {
    try {
      await api.post('/odrzavanje', { ...odrzForm, oprema_id: showOdrzavanje.id, troskovi: parseFloat(odrzForm.troskovi) || 0, trajanje: parseInt(odrzForm.trajanje) || 0, izvodioc_id: odrzForm.izvodioc_id || null })
      load(); setShowOdrzavanje(null)
    } catch (e) { alert(e.response?.data?.detail || 'Greška') }
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
              {['ID', 'Naziv', 'Tip', 'Tvrtka', 'Lokacija', 'Status', 'Održavanja', 'Troškovi', ''].map(h => (
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
                <td className="px-4 py-3 text-gray-600">{o.broj_odrzavanja}</td>
                <td className="px-4 py-3 text-gray-600">{o.ukupni_troskovi.toFixed(2)} €</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowOdrzavanje(o)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="Unesi održavanje"><Wrench size={16} /></button>
                    <button onClick={() => { setForm(o); setShowEdit(o) }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Uredi"><Edit2 size={16} /></button>
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
          <div className="flex gap-3 mt-6">
            <button onClick={saveOprema} className="btn-primary">Spremi</button>
            <button onClick={() => { setShowAdd(false); setShowEdit(null) }} className="btn-secondary">Odustani</button>
          </div>
        </Modal>
      )}

      {showOdrzavanje && (
        <Modal title={`Unesi održavanje: ${showOdrzavanje.naziv}`} onClose={() => setShowOdrzavanje(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Datum *</label>
              <input type="date" className="input" value={odrzForm.datum} onChange={e => setOdrzForm({ ...odrzForm, datum: e.target.value })} />
            </div>
            <div>
              <label className="label">Vrsta *</label>
              <select className="input" value={odrzForm.vrsta_odrzavanja} onChange={e => setOdrzForm({ ...odrzForm, vrsta_odrzavanja: e.target.value })}>
                {VRSTE.map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={odrzForm.status} onChange={e => setOdrzForm({ ...odrzForm, status: e.target.value })}>
                {STATUSI_ODRZAVANJA.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Izvođač</label>
              <select className="input" value={odrzForm.izvodioc_id} onChange={e => setOdrzForm({ ...odrzForm, izvodioc_id: e.target.value })}>
                <option value="">— odaberi —</option>
                {radnici.map(r => <option key={r.id} value={r.id}>{r.ime} {r.prezime}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Troškovi (€)</label>
              <input type="number" className="input" value={odrzForm.troskovi} onChange={e => setOdrzForm({ ...odrzForm, troskovi: e.target.value })} min="0" step="0.01" />
            </div>
            <div>
              <label className="label">Trajanje (min)</label>
              <input type="number" className="input" value={odrzForm.trajanje} onChange={e => setOdrzForm({ ...odrzForm, trajanje: e.target.value })} min="0" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Opis radova</label>
              <textarea className="input h-24 resize-none" value={odrzForm.opis} onChange={e => setOdrzForm({ ...odrzForm, opis: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Korišteni materijal</label>
              <textarea className="input h-20 resize-none" value={odrzForm.materijal} onChange={e => setOdrzForm({ ...odrzForm, materijal: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Napomene</label>
              <textarea className="input h-20 resize-none" value={odrzForm.napomene} onChange={e => setOdrzForm({ ...odrzForm, napomene: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={saveOdrzavanje} className="btn-primary">Spremi</button>
            <button onClick={() => setShowOdrzavanje(null)} className="btn-secondary">Odustani</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
