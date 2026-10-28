/** The app icon: the white mark on its navy tile, as installed on a phone. Decorative by default (the name is printed beside it). */
export default function BrandLogo({ size = 'md', alt = '' }) {
  const sizes = { sm: 'h-9 w-9 rounded-[0.55rem]', md: 'h-10 w-10 rounded-[0.6rem]', lg: 'h-[4.5rem] w-[4.5rem] rounded-[1.05rem]' }
  return (
    <span
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : 'true'}
      className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-b from-[#163270] to-[#0E2150] text-stock shadow-label ${sizes[size]}`}
    >
      <BrandMark className="h-[52%] w-auto" />
    </span>
  )
}

// The Adix Paper mark as a vector (traced from the logo), so it stays sharp at every density.
const MARK_POINTS = '92,0 145.7,94.5 172,88 151.9,105.5 184,162.5 134,162.5 117,134 82,162.5 0,162.5 12,141 103,110 67,45'

export function BrandMark({ className = '', title }) {
  return (
    <svg viewBox="0 0 184 162.5" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} aria-label={title}>
      <polygon points={MARK_POINTS} fill="currentColor" />
    </svg>
  )
}

/** The white logo for the navy shell: the stacked lockup (rail) or the mark beside the wordmark (phone header). */
export function BrandOnNavy({ variant = 'bar', label }) {
  if (variant === 'rail') {
    return (
      <span className="flex flex-col items-center gap-2 text-stock">
        <BrandMark className="h-11 w-auto" />
        <span className="text-[0.6875rem] font-bold uppercase leading-none tracking-[0.2em]">{label}</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2.5 text-stock">
      <BrandMark className="h-6 w-auto" />
      <span className="text-[0.8125rem] font-bold uppercase leading-none tracking-[0.12em]">{label}</span>
    </span>
  )
}
