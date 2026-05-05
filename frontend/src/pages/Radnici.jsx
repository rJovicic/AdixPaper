import { useEffect, useState } from 'react'
import { Plus, Edit2, UserX, UserCheck, X } from 'lucide-react'
import api from '../api/axios'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

const emptyForm = { username: '', ime: '', prezime: '', email: '', telefon: '', odjel: '', rola: 'radnik', password: '' }

export default function Radnici() {
  const [radnici, setRadnici] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = () => api.get('/korisnici').then(r => setRadnici(Array.isArray(r.data) ? r.data : []))
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.username?.trim() || !form.ime?.trim() || !form.prezime?.trim()) {
      alert('Obavezna polja: Korisničko ime, Ime, Prezime')
      return
    }
    if (!showEdit && !form.password?.trim()) {
      alert('Lozinka je obavezna za novog radnika')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const payload = { ...form }
      if (showEdit && !payload.password) delete payload.password
      if (showEdit) await api.put(`/korisnici/${showEdit.id}`, payload)
      else await api.post('/korisnici', payload)
      await load()
      setShowAdd(false); setShowEdit(null)
      setSuccess(showEdit ? 'Radnik je ažuriran.' : 'Radnik je dodan.')
      window.setTimeout(() => setSuccess(''), 3500)
    } catch (e) {
      const detail = e.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : e.message || 'Greška')
      setError(`Greška pri spremanju: ${msg}`)
      console.error('Save error:', e.response?.data || e)
    } finally {
      setSaving(false)
    }
  }

  const toggleAktivan = async (r) => {
    await api.put(`/korisnici/${r.id}`, { aktivan: !r.aktivan }); load()
  }

  const RolaField = ({ value, onChange }) => (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="radnik">Radnik (prijavljuje kvarove)</option>
      <option value="voditelj">Voditelj održavanja (rješava kvarove)</option>
      <option value="admin">Admin</option>
    </select>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Radnici</h1>
          <p className="text-gray-500 text-sm">{radnici.filter(r => r.aktivan).length} aktivnih</p>
        </div>
        <button onClick={() => { setForm(emptyForm); setShowAdd(true) }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Dodaj radnika
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {radnici.map(r => (
          <div key={r.id} className={`card transition-all ${!r.aktivan ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold ${r.rola === 'admin' ? 'bg-purple-500' : r.rola === 'voditelj' ? 'bg-orange-500' : 'bg-blue-500'}`}>
                  {r.ime[0]}{r.prezime[0]}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{r.ime} {r.prezime}</p>
                  <p className="text-sm text-gray-500">@{r.username}</p>
                </div>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${r.rola === 'admin' ? 'bg-purple-100 text-purple-700' : r.rola === 'voditelj' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                {r.rola}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-gray-500">
              {r.odjel && <p>Odjel: {r.odjel}</p>}
              {r.email && <p>{r.email}</p>}
              {r.telefon && <p>{r.telefon}</p>}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setForm({ ...r, password: '' }); setShowEdit(r) }} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5">
                <Edit2 size={13} /> Uredi
              </button>
              <button onClick={() => toggleAktivan(r)} className={`text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors ${r.aktivan ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                {r.aktivan ? <><UserX size={13} /> Deaktiviraj</> : <><UserCheck size={13} /> Aktiviraj</>}
              </button>
            </div>
          </div>
        ))}
        {radnici.length === 0 && (
          <p className="col-span-3 text-center text-gray-400 py-12">Nema radnika</p>
        )}
      </div>

      {(showAdd || showEdit) && (
        <Modal title={showEdit ? 'Uredi radnika' : 'Dodaj radnika'} onClose={() => { setShowAdd(false); setShowEdit(null) }}>
          <div className="space-y-4">
            {[['username', 'Korisničko ime *'], ['ime', 'Ime *'], ['prezime', 'Prezime *'], ['email', 'Email'], ['telefon', 'Telefon'], ['odjel', 'Odjel']].map(([k, l]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input className="input" value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div>
              <label className="label">Rola</label>
              <RolaField value={form.rola} onChange={v => setForm({ ...form, rola: v })} />
            </div>
            <div>
              <label className="label">{showEdit ? 'Nova lozinka (ostavite prazno za bez promjene)' : 'Lozinka *'}</label>
              <input type="password" className="input" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Spremanje...' : 'Spremi'}
            </button>
            <button onClick={() => { setShowAdd(false); setShowEdit(null) }} className="btn-secondary">Odustani</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
