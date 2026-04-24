const SLA_SATI = { Hitno: 2, Normalno: 8, Nisko: 48 }

export function getSlaInfo(kvar) {
  if (kvar.status === 'Riješeno') return null

  const limit = SLA_SATI[kvar.prioritet]
  if (!limit) return null

  const elapsed = (Date.now() - new Date(kvar.datum_prijave).getTime()) / 3600000
  const pct = elapsed / limit

  if (pct >= 1) return { label: 'SLA istekao', color: 'red', pct: 1 }
  if (pct >= 0.75) return { label: `${Math.round((limit - elapsed) * 60)}min`, color: 'yellow', pct }
  return { label: `${Math.round(limit - elapsed)}h`, color: 'green', pct }
}

export function SlaBadge({ kvar }) {
  const info = getSlaInfo(kvar)
  if (!info) return null

  const colors = {
    green: 'bg-green-100 text-green-700 border-green-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    red: 'bg-red-100 text-red-700 border-red-200 animate-pulse'
  }

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colors[info.color]}`}>
      SLA: {info.label}
    </span>
  )
}
