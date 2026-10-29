// Response windows per priority, in hours, from the report to the FIRST RESPONSE (a lead first
// moving the fault out of "Novo"; `datum_odziva`). Mirrors backend models.SLA_SATI.
export const SLA_HOURS = { Hitno: 2, Normalno: 8, Nisko: 48 }
export const OPEN_STATUSES = ['Novo', 'U rješavanju', 'Na čekanju']

/** Still waiting for its first response (mirrors backend Kvar.ceka_odziv). */
export const awaitingResponse = (fault) => Boolean(fault) && fault.status === 'Novo' && !fault.datum_odziva

/**
 * Where a fault waiting for its first response stands against its window.
 * state: 'none' (already responded, resolved or unknown), 'ok', 'soon' (>= 75 % used), 'late'.
 */
export function slaInfo(fault, now = Date.now()) {
  const hours = SLA_HOURS[fault?.prioritet]
  if (!awaitingResponse(fault) || !hours || !fault.datum_prijave) {
    return { state: 'none', ratio: -1, minutesLeft: null }
  }
  const elapsedMin = (now - new Date(fault.datum_prijave).getTime()) / 60000
  const limitMin = hours * 60
  const ratio = elapsedMin / limitMin
  const minutesLeft = Math.round(limitMin - elapsedMin)
  const state = ratio >= 1 ? 'late' : ratio >= 0.75 ? 'soon' : 'ok'
  return { state, ratio, minutesLeft }
}

/** Closest to (or furthest past) its due time first; faults without a deadline last. */
export function byRisk(a, b) {
  const left = (fault) => slaInfo(fault).minutesLeft ?? Number.POSITIVE_INFINITY
  return left(a) - left(b)
}
