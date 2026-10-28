import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs an async loader and tracks { data, error, loading }.
 * `reload()` re-runs it; stale responses from earlier runs are ignored.
 * `refresh()` re-runs it quietly (live updates): the current data stays on screen meanwhile and a
 * failed refresh keeps it rather than replacing the page with an error.
 */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true })
  const runId = useRef(0)

  const run = useCallback((options) => {
    const quiet = options?.quiet === true
    const id = ++runId.current
    if (!quiet) setState((current) => ({ ...current, loading: true, error: null }))
    return Promise.resolve()
      .then(loader)
      .then((data) => {
        if (id === runId.current) setState({ data, error: null, loading: false })
        return data
      })
      .catch((error) => {
        if (id !== runId.current) return
        setState((current) => (quiet && current.data !== undefined ? current : { ...current, error, loading: false }))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    run()
  }, [run])

  const setData = useCallback((updater) => {
    setState((current) => ({ ...current, data: typeof updater === 'function' ? updater(current.data) : updater }))
  }, [])

  const refresh = useCallback(() => run({ quiet: true }), [run])

  return { ...state, reload: run, refresh, setData }
}

export const asArray = (value) => (Array.isArray(value) ? value : [])
