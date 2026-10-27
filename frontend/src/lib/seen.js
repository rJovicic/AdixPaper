// When this worker last looked at each of their faults, so changes since then can be flagged.
// Per device (localStorage); losing it only means a fault shows as "updated" once more.
const key = (userId) => `adix.seen.${userId}`
const KEEP = 200

function read(userId) {
  try {
    const value = JSON.parse(localStorage.getItem(key(userId)) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export function markSeen(userId, faultId) {
  if (!userId) return
  try {
    const seen = read(userId)
    seen[faultId] = new Date().toISOString()
    const entries = Object.entries(seen).sort((a, b) => b[1].localeCompare(a[1])).slice(0, KEEP)
    localStorage.setItem(key(userId), JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Storage unavailable: badges simply stay.
  }
}

/** True when the fault changed (status, assignee, public comment, photo) after the worker last opened it. */
export function isUpdated(userId, fault) {
  if (!fault?.azurirano) return false
  const seen = read(userId)[fault.id]
  return !seen || new Date(fault.azurirano) > new Date(seen)
}
