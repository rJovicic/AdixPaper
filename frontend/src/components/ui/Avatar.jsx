import { initials } from '../AccountMenu'

/** Initials in a circle. Decorative: the name is always given beside it or in the control's label. */
export default function Avatar({ user, size = 'md', tone = 'light', className = '' }) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-9 w-9 text-[0.8125rem]', lg: 'h-16 w-16 text-xl' }
  const tones = {
    light: 'bg-brand-deep text-stock',
    navy: 'bg-stock text-brand-deep',
    outline: 'border-2 border-stock/80 text-stock',
  }
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${sizes[size]} ${tones[tone]} ${className}`}>
      {initials(user)}
    </span>
  )
}
