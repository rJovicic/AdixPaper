/** Logo on its white label chip. Decorative by default: the product name is always printed beside it. */
export default function BrandLogo({ size = 'md', alt = '' }) {
  const sizes = { sm: 'h-9 w-9 p-1', md: 'h-10 w-10 p-1', lg: 'h-20 w-20 p-2' }
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded bg-stock shadow-label ${sizes[size]}`}>
      <img src="/adix-paper-logo.png" alt={alt} className="h-full w-full object-contain" width="250" height="250" />
    </span>
  )
}
