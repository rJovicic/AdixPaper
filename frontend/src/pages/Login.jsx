import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    localStorage.clear()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Unesite korisničko ime i lozinku')
      return
    }
    setLoading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('username', username)
      form.append('password', password)
      const { data } = await api.post('/auth/login', form)
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('rola', data.rola)
      localStorage.setItem('ime', data.ime)
      localStorage.setItem('prezime', data.prezime)
      localStorage.setItem('user_id', data.user_id)
      navigate(data.rola === 'radnik' ? '/radnik' : '/admin')
    } catch (err) {
      setError(err.response?.data?.detail || 'Greška pri prijavi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-2xl shadow-xl mb-4">
            <span className="text-3xl font-black text-blue-800">AP</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Adix Paper</h1>
          <p className="text-blue-200 mt-1">Sustav za upravljanje kvarovima</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Prijava u sustav</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Korisničko ime</label>
              <input
                type="text"
                className="input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="username"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Lozinka</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 text-base mt-2 disabled:opacity-50"
            >
              {loading ? 'Prijavljivanje...' : 'Prijavi se'}
            </button>
          </form>
        </div>
        <p className="text-center text-blue-200 text-sm mt-4">
          Cupup d.o.o &amp; Delt papir d.o.o
        </p>
      </div>
    </div>
  )
}
