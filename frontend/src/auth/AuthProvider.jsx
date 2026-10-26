import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, onUnauthorized } from '../api/client'
import { clearSession, readSession, writeSession } from './session'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [session, setSession] = useState(readSession)

  const signOut = useCallback((reason) => {
    clearSession()
    setSession(null)
    navigate(reason ? `/login?reason=${reason}` : '/login', { replace: true })
  }, [navigate])

  useEffect(() => {
    onUnauthorized(() => signOut('expired'))
    return () => onUnauthorized(null)
  }, [signOut])

  // Refresh the profile once per load so role or name changes made by an admin apply.
  useEffect(() => {
    if (!session?.token) return
    let active = true
    api.get('/auth/me')
      .then(({ data }) => {
        if (!active) return
        const next = writeSession(session.token, data)
        setSession((current) => (JSON.stringify(current?.user) === JSON.stringify(next.user) ? current : next))
      })
      .catch(() => {
        // 401 is handled by the interceptor; network errors keep the cached profile.
      })
    return () => { active = false }
  }, [session?.token])

  const signIn = useCallback(async (username, password) => {
    const form = new URLSearchParams({ username, password })
    const { data } = await api.post('/auth/login', form)
    if (!data?.access_token) throw new Error('bad-response')
    const next = writeSession(data.access_token, data)
    setSession(next)
    return next.user
  }, [])

  const value = useMemo(() => ({ user: session?.user ?? null, signIn, signOut }), [session, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
