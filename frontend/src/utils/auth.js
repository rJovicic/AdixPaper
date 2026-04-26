export const ROLES = {
  admin: 'admin',
  voditelj: 'voditelj',
  radnik: 'radnik',
}

const VALID_ROLES = Object.values(ROLES)

export function normalizeRole(value) {
  const role = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return VALID_ROLES.includes(role) ? role : ''
}

export function roleLabel(role) {
  const labels = {
    admin: 'Admin',
    voditelj: 'Voditelj',
    radnik: 'Radnik',
  }
  return labels[normalizeRole(role)] || 'Nepoznata rola'
}

export function normalizeUser(data = {}) {
  const rola = normalizeRole(data.rola || data.role)
  const ime = safeText(data.ime || data.first_name)
  const prezime = safeText(data.prezime || data.last_name)
  const username = safeText(data.username)
  const userId = safeText(data.user_id ?? data.id ?? '')

  return {
    id: userId,
    user_id: userId,
    username,
    ime,
    prezime,
    rola,
  }
}

export function getStoredUser() {
  return normalizeUser({
    user_id: localStorage.getItem('user_id'),
    username: localStorage.getItem('username'),
    ime: localStorage.getItem('ime'),
    prezime: localStorage.getItem('prezime'),
    rola: localStorage.getItem('rola'),
  })
}

export function saveSession(data = {}) {
  const token = safeText(data.access_token || data.token || localStorage.getItem('token'))
  const user = normalizeUser(data)

  if (!token || !user.rola) {
    clearSession()
    throw new Error('Backend nije vratio ispravne podatke za prijavu.')
  }

  localStorage.setItem('token', token)
  localStorage.setItem('rola', user.rola)
  localStorage.setItem('ime', user.ime)
  localStorage.setItem('prezime', user.prezime)
  localStorage.setItem('username', user.username)
  localStorage.setItem('user_id', String(user.user_id || ''))

  return user
}

export function clearSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('rola')
  localStorage.removeItem('ime')
  localStorage.removeItem('prezime')
  localStorage.removeItem('username')
  localStorage.removeItem('user_id')
}

export function hasRole(user, allowedRoles) {
  if (!allowedRoles?.length) return true
  return allowedRoles.includes(normalizeRole(user?.rola))
}

export function homeForRole(role) {
  return normalizeRole(role) === ROLES.radnik ? '/radnik' : '/admin'
}

function safeText(value) {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  return text === 'undefined' || text === 'null' ? '' : text
}
