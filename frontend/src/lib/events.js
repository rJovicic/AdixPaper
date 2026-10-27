/**
 * One sentence for a fault event, in the current language. Shared by the fault timeline and
 * the overview's activity feed. `people` maps user id → "First Last" for assignment events.
 */
export function eventTitle(event, i18n, people = {}) {
  const { t, status, priority, waitingReason } = i18n
  const data = event.podaci || {}
  const base = t(`fault.events.${event.tip}`)
  if (event.tip === 'status' && data.old && data.new) {
    const change = `${base}: ${t('fault.eventChange', { from: status(data.old), to: status(data.new) })}`
    return data.razlog ? `${change} (${waitingReason(data.razlog)})` : change
  }
  if (event.tip === 'prioritet' && data.old && data.new) return `${base}: ${t('fault.eventChange', { from: priority(data.old), to: priority(data.new) })}`
  if (event.tip === 'waiting' && data.old && data.new) return `${base}: ${t('fault.eventChange', { from: waitingReason(data.old), to: waitingReason(data.new) })}`
  if (event.tip === 'assignment') {
    if (!data.new) return `${base}: ${t('fault.eventUnassigned')}`
    if (people[data.new]) return `${base}: ${t('fault.eventAssigned', { name: people[data.new] })}`
  }
  if (event.tip === 'prilog' && event.naslov?.startsWith('Uklonjena')) return t('fault.events.prilogRemoved')
  return base.startsWith('fault.') ? event.naslov : base
}
