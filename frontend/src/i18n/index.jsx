import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import hr from './hr'
import en from './en'

const DICTIONARIES = { hr, en }
const LOCALES = { hr: 'hr-HR', en: 'en-GB' }
const STORAGE_KEY = 'adix.lang'

export const LANGUAGES = [
  { code: 'hr', label: 'Hrvatski', short: 'HR' },
  { code: 'en', label: 'English', short: 'EN' },
]

function readStoredLanguage() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value in DICTIONARIES ? value : 'hr'
  } catch {
    return 'hr'
  }
}

function lookup(dictionary, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dictionary)
}

function interpolate(text, params) {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined || params[name] === null ? match : String(params[name])))
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLanguage)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next) => {
    if (!(next in DICTIONARIES)) return
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage can be unavailable (private mode); the choice still applies to this session.
    }
  }, [])

  const value = useMemo(() => {
    const dictionary = DICTIONARIES[lang]
    const locale = LOCALES[lang]

    const t = (key, params) => {
      const text = lookup(dictionary, key) ?? lookup(hr, key)
      if (typeof text !== 'string') {
        if (import.meta.env.DEV) console.warn(`Missing translation: ${key}`)
        return key
      }
      return interpolate(text, params)
    }

    const dateTime = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const dateShort = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    const dateOnly = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    const dateLong = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
    const moneyRound = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })

    const safe = (formatter) => (value) => {
      if (value === null || value === undefined || value === '') return '—'
      const date = value instanceof Date ? value : new Date(value)
      return Number.isNaN(date.getTime()) ? '—' : formatter.format(date)
    }

    const format = {
      dateTime: safe(dateTime),
      dateShort: safe(dateShort),
      date: safe(dateOnly),
      dateLong: safe(dateLong),
      money: (value) => money.format(Number(value || 0)),
      moneyRound: (value) => moneyRound.format(Number(value || 0)),
      number: (value) => (value === null || value === undefined || value === '' ? '—' : number.format(Number(value))),
      duration: (minutes) => {
        const total = Math.max(0, Math.round(Number(minutes) || 0))
        const h = Math.floor(total / 60)
        const m = total % 60
        if (h >= 48) return t('time.days', { n: Math.round(h / 24) })
        // Minutes stop mattering once a deadline is hours away.
        if (h >= 10) return t('time.hours', { h })
        if (h > 0) return m ? t('time.hoursMinutes', { h, m }) : t('time.hours', { h })
        return t('time.minutes', { m })
      },
    }

    const status = (value) => lookup(dictionary, `status.${value}`) ?? value
    const priority = (value) => lookup(dictionary, `priority.${value}`) ?? value
    const role = (value) => lookup(dictionary, `roles.${value}`) ?? value
    const machineStatus = (value) => lookup(dictionary, `machineStatus.${value}`) ?? value

    // The API answers in Croatian; English users get the matching translation when one exists.
    const backend = (message) => (lang === 'hr' ? message : dictionary.backend?.[message] ?? message)

    return { lang, setLang, locale, t, format, status, priority, role, machineStatus, backend }
  }, [lang, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}
