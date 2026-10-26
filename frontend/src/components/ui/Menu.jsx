import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

/** Disclosure menu: button + list of actions. Closes on Escape, outside click, or selection. */
export default function Menu({ label, icon: Icon, items, note, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    rootRef.current?.querySelector('[role=menuitem]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onMenuKey = (event) => {
    const options = [...rootRef.current.querySelectorAll('[role=menuitem]:not([disabled])')]
    const index = options.indexOf(document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      options[(index + 1) % options.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      options[(index - 1 + options.length) % options.length]?.focus()
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="btn-secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {Icon && <Icon size={17} aria-hidden="true" />}
        {label}
        <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          onKeyDown={onMenuKey}
          className={`enter-fade absolute z-30 mt-1.5 w-72 overflow-hidden rounded-lg border border-rule bg-stock py-1 shadow-lift ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                buttonRef.current?.focus()
                item.onSelect()
              }}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[0.9375rem] text-ink hover:bg-brand-wash focus:bg-brand-wash focus:outline-none disabled:opacity-50"
            >
              {item.icon && <item.icon size={17} aria-hidden="true" className="shrink-0 text-ink-2" />}
              {item.label}
            </button>
          ))}
          {note && <p className="border-t border-rule px-3.5 py-2 text-meta text-ink-3">{note}</p>}
        </div>
      )}
    </div>
  )
}
