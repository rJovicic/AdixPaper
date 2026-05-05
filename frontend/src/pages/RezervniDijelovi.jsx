import { useEffect, useMemo, useState } from 'react'
import { Edit2, PackagePlus, Search, Trash2, X } from 'lucide-react'
import api from '../api/axios'

const emptyPart = { naziv: '', sifra: '', dobavljac_id: '', jedinica: 'kom', zaliha: '', cijena: '', aktivan: true }
const emptySupplier = { naziv: '', oznaka: '', aktivan: true }

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export default function RezervniDijelovi() {
  const [parts, setParts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [partForm, setPartForm] = useState(emptyPart)
  const [supplierForm, setSupplierForm] = useState(emptySupplier)
  const [editingPart, setEditingPart] = useState(null)
  const [showPart, setShowPart] = useState(false)
  const [showSupplier, setShowSupplier] = useState(false)

  const load = async () => {
    const [partsResponse, suppliersResponse] = await Promise.all([
      api.get('/rezervni-dijelovi'),
      api.get('/rezervni-dijelovi/dobavljaci')
    ])
    setParts(Array.isArray(partsResponse.data) ? partsResponse.data : [])
    setSuppliers(Array.isArray(suppliersResponse.data) ? suppliersResponse.data : [])
  }

  useEffect(() => { load() }, [])

  const filteredParts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return parts.filter(part => {
      const supplierMatch = !supplierFilter || Number(part.dobavljac_id || part.dobavljac?.id) === Number(supplierFilter)
      const queryMatch = !q || `${part.naziv} ${part.sifra || ''} ${part.dobavljac?.naziv || ''}`.toLowerCase().includes(q)
      return supplierMatch && queryMatch
    })
  }, [parts, search, supplierFilter])

  const openNewPart = () => {
    setEditingPart(null)
    setPartForm({ ...emptyPart, dobavljac_id: suppliers[0]?.id || '' })
    setShowPart(true)
  }

  const savePart = async () => {
    if (!partForm.naziv.trim() || !partForm.dobavljac_id) {
      alert('Naziv i dobavljač su obavezni')
      return
    }
    const payload = {
      ...partForm,
      dobavljac_id: Number(partForm.dobavljac_id),
      zaliha: partForm.zaliha === '' ? null : Number(partForm.zaliha),
      cijena: partForm.cijena === '' ? null : Number(partForm.cijena)
    }
    if (editingPart) await api.put(`/rezervni-dijelovi/${editingPart.id}`, payload)
    else await api.post('/rezervni-dijelovi', payload)
    setShowPart(false)
    await load()
  }

  const saveSupplier = async () => {
    if (!supplierForm.naziv.trim()) {
      alert('Naziv dobavljača je obavezan')
      return
    }
    await api.post('/rezervni-dijelovi/dobavljaci', supplierForm)
    setShowSupplier(false)
    setSupplierForm(emptySupplier)
    await load()
  }

  const deactivatePart = async (part) => {
    if (!confirm(`Deaktivirati rezervni dio "${part.naziv}"?`)) return
    await api.delete(`/rezervni-dijelovi/${part.id}`)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rezervni dijelovi</h1>
          <p className="text-sm text-gray-500">{parts.length} aktivnih dijelova · {suppliers.length} dobavljača</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowSupplier(true)} className="btn-secondary">Dodaj dobavljača</button>
          <button onClick={openNewPart} className="btn-primary flex items-center gap-2"><PackagePlus size={18} /> Dodaj rezervni dio</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_260px]">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="Pretraži po nazivu, šifri ili dobavljaču..." />
        </div>
        <select className="input" value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
          <option value="">Svi dobavljači</option>
          {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.naziv}</option>)}
        </select>
      </div>

      <div className="card p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Dio</th>
                <th className="px-4 py-3 text-left font-medium">Šifra</th>
                <th className="px-4 py-3 text-left font-medium">Dobavljač</th>
                <th className="px-4 py-3 text-left font-medium">Zaliha</th>
                <th className="px-4 py-3 text-left font-medium">Jedinica</th>
                <th className="px-4 py-3 text-left font-medium">Cijena</th>
                <th className="px-4 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredParts.map(part => (
                <tr key={part.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{part.naziv}</td>
                  <td className="px-4 py-3 text-gray-500">{part.sifra || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{part.dobavljac?.naziv || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{part.zaliha === null || part.zaliha === undefined ? '—' : Number(part.zaliha).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500">{part.jedinica}</td>
                  <td className="px-4 py-3 text-gray-600">{part.cijena === null || part.cijena === undefined ? '—' : `${Number(part.cijena).toFixed(2)} €`}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingPart(part)
                          setPartForm({ ...part, cijena: part.cijena ?? '', zaliha: part.zaliha ?? '', dobavljac_id: part.dobavljac_id || part.dobavljac?.id || '' })
                          setShowPart(true)
                        }}
                        className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                        title="Uredi"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deactivatePart(part)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Deaktiviraj">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredParts.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Nema rezervnih dijelova</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPart && (
        <Modal title={editingPart ? 'Uredi rezervni dio' : 'Dodaj rezervni dio'} onClose={() => setShowPart(false)}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Naziv *</label>
              <input className="input" value={partForm.naziv} onChange={e => setPartForm({ ...partForm, naziv: e.target.value })} />
            </div>
            <div>
              <label className="label">Šifra / SKU</label>
              <input className="input" value={partForm.sifra || ''} onChange={e => setPartForm({ ...partForm, sifra: e.target.value })} />
            </div>
            <div>
              <label className="label">Dobavljač *</label>
              <select className="input" value={partForm.dobavljac_id || ''} onChange={e => setPartForm({ ...partForm, dobavljac_id: e.target.value })}>
                <option value="">Odaberi dobavljača</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.naziv}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Jedinica</label>
              <input className="input" value={partForm.jedinica || 'kom'} onChange={e => setPartForm({ ...partForm, jedinica: e.target.value })} />
            </div>
            <div>
              <label className="label">Zaliha</label>
              <input type="number" min="0" step="0.01" className="input" value={partForm.zaliha ?? ''} onChange={e => setPartForm({ ...partForm, zaliha: e.target.value })} />
            </div>
            <div>
              <label className="label">Cijena (€)</label>
              <input type="number" min="0" step="0.01" className="input" value={partForm.cijena ?? ''} onChange={e => setPartForm({ ...partForm, cijena: e.target.value })} />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={savePart} className="btn-primary">Spremi</button>
            <button onClick={() => setShowPart(false)} className="btn-secondary">Odustani</button>
          </div>
        </Modal>
      )}

      {showSupplier && (
        <Modal title="Dodaj dobavljača" onClose={() => setShowSupplier(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Naziv *</label>
              <input className="input" value={supplierForm.naziv} onChange={e => setSupplierForm({ ...supplierForm, naziv: e.target.value })} />
            </div>
            <div>
              <label className="label">Oznaka</label>
              <input className="input" value={supplierForm.oznaka || ''} onChange={e => setSupplierForm({ ...supplierForm, oznaka: e.target.value })} />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={saveSupplier} className="btn-primary">Spremi</button>
            <button onClick={() => setShowSupplier(false)} className="btn-secondary">Odustani</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
