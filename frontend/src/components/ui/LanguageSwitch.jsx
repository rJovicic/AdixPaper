import { LANGUAGES, useI18n } from '../../i18n'

/** HR / EN segmented switch. `tone="deep"` for use on the blue shell. */
export default function LanguageSwitch({ tone = 'light', className = '' }) {
  const { lang, setLang, t } = useI18n()
  const styles = tone === 'deep'
    ? { group: 'border-white/25', on: 'bg-stock text-brand-deep', off: 'text-brand-on-deep hover:text-stock hover:bg-white/10' }
    : { group: 'border-rule-strong/60', on: 'bg-brand-deep text-stock', off: 'text-ink-2 hover:text-ink hover:bg-ink/5' }

  return (
    <div role="group" aria-label={t('common.language')} className={`inline-flex rounded border p-0.5 ${styles.group} ${className}`}>
      {LANGUAGES.map((language) => (
        <button
          key={language.code}
          type="button"
          lang={language.code}
          aria-pressed={lang === language.code}
          aria-label={language.label}
          onClick={() => setLang(language.code)}
          className={`min-h-[2.25rem] min-w-[2.75rem] rounded-sm px-2.5 text-sm font-semibold transition-colors ${lang === language.code ? styles.on : styles.off}`}
        >
          {language.short}
        </button>
      ))}
    </div>
  )
}
