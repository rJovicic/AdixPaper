/** Logo on its white chip, for light surfaces. Decorative by default: the product name is always printed beside it. */
export default function BrandLogo({ size = 'md', alt = '' }) {
  const sizes = { sm: 'h-9 w-9 p-1', md: 'h-10 w-10 p-1', lg: 'h-20 w-20 p-2' }
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded bg-stock shadow-label ${sizes[size]}`}>
      <img src="/adix-paper-logo.png" alt={alt} className="h-full w-full object-contain" width="250" height="250" />
    </span>
  )
}

/** The white logo for the navy shell: the full lockup (rail) or the mark beside the wordmark (phone header). */
export function BrandOnNavy({ variant = 'bar', label }) {
  if (variant === 'rail') {
    return <img src="/adix-paper-logo-white.png" alt={label} width="222" height="198" className="h-[4.25rem] w-auto" />
  }
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src="/adix-paper-mark-white.png" alt="" width="187" height="166" className="h-7 w-auto" />
      <span className="text-[0.8125rem] font-bold uppercase leading-none tracking-[0.12em] text-stock">{label}</span>
    </span>
  )
}
