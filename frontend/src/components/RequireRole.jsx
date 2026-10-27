import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { homeForRole } from '../auth/session'

export default function RequireRole({ roles, children }) {
  const { user, endReason } = useAuth()
  const location = useLocation()
  if (!user) {
    // A deep link (e.g. a machine's QR code) or an expired session returns here after sign-in;
    // a deliberate sign-out does not.
    const from = endReason === 'signedOut' ? undefined : { from: `${location.pathname}${location.search}` }
    return <Navigate to={endReason ? `/login?reason=${endReason}` : '/login'} replace state={from} />
  }
  if (roles && !roles.includes(user.rola)) return <Navigate to={homeForRole(user.rola)} replace />
  return children
}
