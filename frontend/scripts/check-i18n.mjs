// Verifies that both dictionaries have the same keys and that every literal t('key') used in src exists.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import hr from '../src/i18n/hr.js'
import en from '../src/i18n/en.js'

const flatten = (node, prefix = '') => Object.entries(node).flatMap(([key, value]) =>
  value && typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`])

const hrKeys = new Set(flatten({ ...hr, backend: {} }))
const enKeys = new Set(flatten({ ...en, backend: {} }))
const problems = []
for (const key of hrKeys) if (!enKeys.has(key)) problems.push(`missing in en: ${key}`)
for (const key of enKeys) if (!hrKeys.has(key)) problems.push(`missing in hr: ${key}`)

const files = []
const walk = (dir) => readdirSync(dir).forEach((name) => {
  const path = join(dir, name)
  if (statSync(path).isDirectory()) walk(path)
  else if (/\.(jsx?|mjs)$/.test(name)) files.push(path)
})
walk(new URL('../src', import.meta.url).pathname)

const used = new Set()
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(match[1])
  // Keys passed around as values, e.g. { key: 'nav.faults' } then t(item.key).
  for (const match of source.matchAll(/'([a-z]+\.[a-zA-Z0-9_.]+)'/g)) if (hrKeys.has(match[1])) used.add(match[1])
}
for (const key of used) if (!hrKeys.has(key)) problems.push(`used but undefined: ${key}`)
for (const key of hrKeys) {
  const dynamicPrefixes = ['status.', 'priority.', 'priorityHint.', 'roles.', 'roleHints.', 'machineStatus.', 'fault.events.', 'waiting.reasons.', 'waiting.hints.', 'attention.', 'dashboard.periods.', 'dashboard.periodName.', 'analytics.periods.', 'analytics.defs.']
  if (!used.has(key) && !dynamicPrefixes.some((prefix) => key.startsWith(prefix))) problems.push(`unused: ${key}`)
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`i18n OK: ${hrKeys.size} keys, ${used.size} referenced`)
