import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, onUnauthorized } from '../api/client'
import { clearSession, readSession, writeSession } from './session'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession)
  // Why the last session ended ('expired' | 'signedOut'). RequireRole turns it into the
  // redirect: navigating here as well raced with it (React Router applies navigations as
  // transitions) and the "session expired" notice and return path were lost.
  const [endReason, setEndReason] = useState(null)

  const signOut = useCallback((reason) => {
    clearSession()
    setEndReason(reason || null)
    setSession(null)
  }, [])

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
    setEndReason(null)
    setSession(next)
    return next.user
  }, [])

  /** Keeps the signed-in user but swaps the token (after a password change revokes the old one). */
  const replaceToken = useCallback((token) => {
    setSession((current) => (current ? writeSession(token, { ...current.user, user_id: current.user.id }) : current))
  }, [])

  const value = useMemo(
    () => ({ user: session?.user ?? null, endReason, signIn, signOut, replaceToken }),
    [session, endReason, signIn, signOut, replaceToken],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
