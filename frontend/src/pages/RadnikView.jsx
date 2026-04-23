import { useEffect, useState } from 'react'
import { LogOut, Plus, ClipboardList, CheckCircle, Clock, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

const VRSTE = ['Redovno servisiranje', 'Popravak kvara', 'Elektro kvar', 'Preventivno održavanje', 'Godišnji servis', 'Ostalo']

export default function RadnikView() {
  const navigate = useNavigate()
  const ime = localStorage.getItem('ime')
  const prezime = localStorage.getItem('prezime')
  const userId = localStorage.getItem('user_id')

  const [mojaOdrzavanja, setMojaOdrzavanja] = useState([])
  const [oprema, setOprema] = useState([])
  const [radnici, setRadnici] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ oprema_id: '', datum: new Date().toISOString().slice(0, 10), vrsta_odrzavanja: 'Redovno servisiranje', opis: '', materijal: '', troskovi: '', trajanje: '', status: 'Završeno', napomene: '', izvodioc_id: userId })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/odrzavanje/moje').then(r => setMojaOdrzavanja(r.data))
    api.get('/oprema').then(r => setOprema(r.data))
    api.get('/korisnici/radnici/lista').then(r => setRadnici(r.data))
  }, [])

  const logout = () => { localStorage.clear(); navigate('/login') }

  const save = async () => {
    if (!form.oprema_id) return alert('Odaberite opremu!')
    setSaving(true)
    try {
      await api.post('/odrzavanje', { ...form, oprema_id: parseInt(form.oprema_id), troskovi: parseFloat(form.troskovi) || 0, trajanje: parseInt(form.trajanje) || 0, izvodioc_id: parseInt(userId) })
      api.get('/odrzavanje/moje').then(r => setMojaOdrzavanja(r.data))
      setShowForm(false)
      setForm({ oprema_id: '', datum: new Date().toISOString().slice(0, 10), vrsta_odrzavanja: 'Redovno servisiranje', opis: '', materijal: '', troskovi: '', trajanje: '', status: 'Završeno', napomene: '', izvodioc_id: userId })
    } catch (e) { alert(e.response?.data?.detail || 'Greška') }
    finally { setSaving(false) }
  }

  const STATUS_COLOR = { 'Završeno': 'text-green-600', 'U tijeku': 'text-yellow-600', 'Planirano': 'text-blue-600' }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-800 text-white px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center">
            <span className="text-blue-800 font-black text-xs">AP</span>
          </div>
          <div>
            <p className="font-semibold">{ime} {prezime}</p>
            <p className="text-blue-200 text-xs">Radnik</p>
          </div>
        </div>
        <button onClick={logout} className="p-2 hover:bg-blue-700 rounded-lg">
          <LogOut size={20} />
        </button>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          <div className="card text-center">
            <p className="text-3xl font-bold text-blue-600">{mojaOdrzavanja.length}</p>
            <p className="text-sm text-gray-500">Ukupno zapisa</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-green-600">{mojaOdrzavanja.filter(r => r.status === 'Završeno').length}</p>
            <p className="text-sm text-gray-500">Završeno</p>
          </div>
        </div>

        {/* New entry button */}
        <button onClick={() => setShowForm(true)} className="w-full btn-primary py-4 text-base flex items-center justify-center gap-2">
          <Plus size={22} /> Unesi novo održavanje
        </button>

        {/* My records */}
        <div className="card p-0">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <ClipboardList size={18} className="text-gray-500" />
            <h3 className="font-semibold text-gray-800">Moji zapisi</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {mojaOdrzavanja.slice(0, 20).map(r => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{r.oprema_naziv}</p>
                    <p className="text-xs text-gray-500">{r.vrsta_odrzavanja} • {r.datum}</p>
                    {r.trajanje > 0 && <p className="text-xs text-gray-400">{r.trajanje} min</p>}
                  </div>
                  <span className={`text-xs font-medium ${STATUS_COLOR[r.status] || 'text-gray-500'}`}>{r.status}</span>
                </div>
              </div>
            ))}
            {mojaOdrzavanja.length === 0 && (
              <p className="text-center text-gray-400 py-8 text-sm">Nemate zapisa</p>
            )}
          </div>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between p-4 border-b bg-blue-800 text-white">
            <h2 className="font-semibold">Unos održavanja</h2>
            <button onClick={() => setShowForm(false)} className="p-2 hover:bg-blue-700 rounded-lg"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="label">Oprema *</label>
              <select className="input" value={form.oprema_id} onChange={e => setForm({ ...form, oprema_id: e.target.value })}>
                <option value="">— odaberi opremu —</option>
                {oprema.map(o => <option key={o.id} value={o.id}>{o.naziv} ({o.tip})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Datum *</label>
              <input type="date" className="input" value={form.datum} onChange={e => setForm({ ...form, datum: e.target.value })} />
            </div>
            <div>
              <label className="label">Vrsta *</label>
              <select className="input" value={form.vrsta_odrzavanja} onChange={e => setForm({ ...form, vrsta_odrzavanja: e.target.value })}>
                {VRSTE.map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {['Završeno', 'U tijeku', 'Planirano'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Troškovi (€)</label>
                <input type="number" className="input" value={form.troskovi} onChange={e => setForm({ ...form, troskovi: e.target.value })} min="0" step="0.01" />
              </div>
              <div>
                <label className="label">Trajanje (min)</label>
                <input type="number" className="input" value={form.trajanje} onChange={e => setForm({ ...form, trajanje: e.target.value })} min="0" />
              </div>
            </div>
            <div>
              <label className="label">Opis radova</label>
              <textarea className="input h-28 resize-none" value={form.opis} onChange={e => setForm({ ...form, opis: e.target.value })} />
            </div>
            <div>
              <label className="label">Korišteni materijal</label>
              <textarea className="input h-20 resize-none" value={form.materijal} onChange={e => setForm({ ...form, materijal: e.target.value })} />
            </div>
            <div>
              <label className="label">Napomene</label>
              <textarea className="input h-20 resize-none" value={form.napomene} onChange={e => setForm({ ...form, napomene: e.target.value })} />
            </div>
          </div>
          <div className="p-4 border-t bg-white">
            <button onClick={save} disabled={saving} className="w-full btn-primary py-4 text-base disabled:opacity-50">
              {saving ? 'Spremanje...' : 'Spremi zapis'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
