import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, User, Wrench, Save, CheckCircle, Play, Pause, History, MessageSquare, Send, Lock } from 'lucide-react'
import api from '../api/axios'
import { SlaBadge } from '../utils/sla'
import { PrioritetBadge, StatusBadge } from './Dashboard'

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

export default function KvarDetalji() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [kvar, setKvar] = useState(null)
  const [form, setForm] = useState({
    status: '', voditelj_id: '', sto_je_uradjeno: '', materijal: '',
    troskovi: '', trajanje_min: '', napomene_voditelja: '', prioritet: ''
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [events, setEvents] = useState([])
  const [comment, setComment] = useState('')
  const [internalComment, setInternalComment] = useState(false)
  const [commentSaving, setCommentSaving] = useState(false)

  const load = async () => {
    const [kvarResponse, eventsResponse] = await Promise.all([
      api.get(`/kvarovi/${id}`),
      api.get(`/kvarovi/${id}/dogadjaji`).catch(() => ({ data: [] }))
    ])
    const data = kvarResponse.data
    setKvar(data)
    setEvents(Array.isArray(eventsResponse.data) ? eventsResponse.data : [])
    setForm({
      status: data.status,
      voditelj_id: data.voditelj_id || '',
      sto_je_uradjeno: data.sto_je_uradjeno || '',
      materijal: data.materijal || '',
      troskovi: data.troskovi || '',
      trajanje_min: data.trajanje_min || '',
      napomene_voditelja: data.napomene_voditelja || '',
      prioritet: data.prioritet
    })
  }

  useEffect(() => { load() }, [id])

  const save = async (extraData = {}) => {
    setSaving(true)
    setMsg('')
    try {
      const payload = { ...form, ...extraData }
      if (payload.troskovi === '' || payload.troskovi === null) delete payload.troskovi
      else payload.troskovi = parseFloat(payload.troskovi) || 0
      if (payload.trajanje_min === '' || payload.trajanje_min === null) delete payload.trajanje_min
      else payload.trajanje_min = parseInt(payload.trajanje_min) || 0
      if (!payload.voditelj_id) delete payload.voditelj_id

      await api.put(`/kvarovi/${id}`, payload)
      setMsg('Spremljeno!')
      await load()
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Greška')
    } finally {
      setSaving(false)
    }
  }

  const setStatus = (status) => save({ status })

  const addComment = async () => {
    const tekst = comment.trim()
    if (!tekst) return

    setCommentSaving(true)
    setMsg('')
    try {
      await api.post(`/kvarovi/${id}/komentari`, { tekst, interno: internalComment })
      setComment('')
      setInternalComment(false)
      await load()
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Greška pri spremanju komentara')
    } finally {
      setCommentSaving(false)
    }
  }

  const fmt = (dt) => dt ? new Date(dt).toLocaleString('hr-HR') : '—'
  const fmtDate = (dt) => dt ? new Date(dt).toLocaleDateString('hr-HR') : '—'
  const eventColor = (tip) => ({
    created: 'bg-blue-50 text-blue-700',
    status: 'bg-yellow-50 text-yellow-700',
    prioritet: 'bg-red-50 text-red-700',
    assignment: 'bg-purple-50 text-purple-700',
    details: 'bg-gray-50 text-gray-700',
    komentar: 'bg-green-50 text-green-700'
  }[tip] || 'bg-gray-50 text-gray-700')

  if (!kvar) return <div className="text-center py-20 text-gray-400">Učitavanje...</div>

  const isResolved = kvar.status === 'Riješeno'

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/kvarovi')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">#{kvar.id} {kvar.naslov}</h1>
            <PrioritetBadge prioritet={kvar.prioritet} />
            <StatusBadge status={kvar.status} />
            <SlaBadge kvar={kvar} />
          </div>
          <p className="text-gray-400 text-sm mt-0.5">Prijavljeno: {fmt(kvar.datum_prijave)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="card">
          <div className="flex items-center gap-2 text-gray-500 mb-2"><Wrench size={15} /> Oprema</div>
          <p className="font-semibold text-gray-800">{kvar.oprema?.naziv || '—'}</p>
          {kvar.oprema?.lokacija && <p className="text-gray-500">{kvar.oprema.lokacija}</p>}
        </div>
        <div className="card">
          <div className="flex items-center gap-2 text-gray-500 mb-2"><User size={15} /> Prijavio</div>
          <p className="font-semibold text-gray-800">{kvar.prijavio ? `${kvar.prijavio.ime} ${kvar.prijavio.prezime}` : '—'}</p>
          <p className="text-gray-500">{fmtDate(kvar.datum_prijave)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 text-gray-500 mb-2"><Clock size={15} /> Vremena</div>
          <p className="text-gray-600">Početak: {fmt(kvar.datum_pocetka)}</p>
          <p className="text-gray-600">Riješeno: {fmt(kvar.datum_rjesavanja)}</p>
        </div>
      </div>

      {kvar.opis && (
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-2">Opis problema</h3>
          <p className="text-gray-600 whitespace-pre-wrap">{kvar.opis}</p>
        </div>
      )}

      {!isResolved && (
        <div className="card bg-blue-50 border border-blue-100">
          <h3 className="font-semibold text-gray-700 mb-3">Brze akcije</h3>
          <div className="flex flex-wrap gap-2">
            {kvar.status === 'Novo' && (
              <button onClick={() => setStatus('U rješavanju')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                <Play size={14} /> Preuzmi kvar
              </button>
            )}
            {kvar.status === 'U rješavanju' && (
              <button onClick={() => setStatus('Na čekanju')} className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600 transition-colors">
                <Pause size={14} /> Stavi na čekanje
              </button>
            )}
            {kvar.status === 'Na čekanju' && (
              <button onClick={() => setStatus('U rješavanju')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                <Play size={14} /> Nastavi rješavanje
              </button>
            )}
            <button onClick={() => setStatus('Riješeno')} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors">
              <CheckCircle size={14} /> Označi riješenim
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold text-gray-700 mb-4">Detalji rješavanja</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Status">
            <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="Novo">Novo</option>
              <option value="U rješavanju">U rješavanju</option>
              <option value="Na čekanju">Na čekanju</option>
              <option value="Riješeno">Riješeno</option>
            </select>
          </Field>
          <Field label="Prioritet">
            <select className="input" value={form.prioritet} onChange={e => setForm({ ...form, prioritet: e.target.value })}>
              <option value="Hitno">Hitno</option>
              <option value="Normalno">Normalno</option>
              <option value="Nisko">Nisko</option>
            </select>
          </Field>
          <Field label="Troškovi (€)">
            <input type="number" step="0.01" min="0" className="input" value={form.troskovi}
              onChange={e => setForm({ ...form, troskovi: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Trajanje (minuta)">
            <input type="number" min="0" className="input" value={form.trajanje_min}
              onChange={e => setForm({ ...form, trajanje_min: e.target.value })} placeholder="0" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Što je urađeno">
              <textarea className="input" rows={3} value={form.sto_je_uradjeno}
                onChange={e => setForm({ ...form, sto_je_uradjeno: e.target.value })}
                placeholder="Opis radova..." />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Materijal i dijelovi">
              <textarea className="input" rows={2} value={form.materijal}
                onChange={e => setForm({ ...form, materijal: e.target.value })}
                placeholder="Utrošeni materijal..." />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Napomene voditelja">
              <textarea className="input" rows={2} value={form.napomene_voditelja}
                onChange={e => setForm({ ...form, napomene_voditelja: e.target.value })}
                placeholder="Interne napomene..." />
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button onClick={() => save()} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            <Save size={16} /> {saving ? 'Spremanje...' : 'Spremi'}
          </button>
          <button onClick={() => navigate('/admin/kvarovi')} className="btn-secondary">Odustani</button>
          {msg && <span className={`text-sm ${msg.includes('Greška') ? 'text-red-500' : 'text-green-600'}`}>{msg}</span>}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <History size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-700">Timeline i komentari</h3>
        </div>

        <div className="space-y-3 mb-5">
          {events.length === 0 ? (
            <p className="text-sm text-gray-400">Još nema zapisa aktivnosti za ovaj kvar.</p>
          ) : events.map(event => (
            <div key={event.id} className="flex gap-3">
              <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${eventColor(event.tip)}`}>
                {event.tip === 'komentar' ? <MessageSquare size={15} /> : <History size={15} />}
              </div>
              <div className="min-w-0 flex-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800">{event.naslov}</p>
                  {event.interno && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      <Lock size={11} /> interno
                    </span>
                  )}
                </div>
                {event.opis && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{event.opis}</p>}
                <p className="mt-1 text-xs text-gray-400">
                  {fmt(event.kreiran)}
                  {event.korisnik ? ` · ${event.korisnik.ime} ${event.korisnik.prezime}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-3">
          <Field label="Dodaj komentar">
            <textarea
              className="input"
              rows={3}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Napiši što se dogodilo, što se čeka ili što treba napraviti..."
            />
          </Field>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={internalComment}
                onChange={e => setInternalComment(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Interna napomena
            </label>
            <button
              onClick={addComment}
              disabled={commentSaving || !comment.trim()}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              <Send size={16} /> {commentSaving ? 'Spremanje...' : 'Dodaj komentar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
