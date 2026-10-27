/**
 * Focuses the first field marked invalid inside `container`. Runs after the next paint:
 * callers set the error state in the same tick, so the markers are not in the DOM yet.
 */
export function focusFirstInvalid(containerRef) {
  requestAnimationFrame(() => containerRef.current?.querySelector('[aria-invalid=true]')?.focus())
}
