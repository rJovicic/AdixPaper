const KEY = 'adix.session'
const LEGACY_KEYS = ['token', 'rola', 'ime', 'prezime', 'username', 'user_id']
const ROLES = ['admin', 'voditelj', 'radnik']

export function normalizeRole(value) {
  const role = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return ROLES.includes(role) ? role : ''
}

export function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (session?.token && normalizeRole(session.user?.rola)) return session
  } catch {
    // Corrupt or unavailable storage counts as signed out.
  }
  return null
}

export function writeSession(token, data) {
  const user = {
    id: data.user_id ?? data.id,
    username: data.username || '',
    ime: data.ime || '',
    prezime: data.prezime || '',
    rola: normalizeRole(data.rola || data.role),
  }
  const session = { token, user }
  localStorage.setItem(KEY, JSON.stringify(session))
  return session
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY)
    // Keys written by the previous version of the app.
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Nothing to clear.
  }
}

export function homeForRole(role) {
  return normalizeRole(role) === 'radnik' ? '/radnik' : '/admin'
}

export function displayName(user) {
  return `${user?.ime || ''} ${user?.prezime || ''}`.trim() || user?.username || ''
}
