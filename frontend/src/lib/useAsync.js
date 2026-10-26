import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs an async loader and tracks { data, error, loading }.
 * `reload()` re-runs it; stale responses from earlier runs are ignored.
 */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true })
  const runId = useRef(0)

  const run = useCallback(() => {
    const id = ++runId.current
    setState((current) => ({ ...current, loading: true, error: null }))
    return Promise.resolve()
      .then(loader)
      .then((data) => {
        if (id === runId.current) setState({ data, error: null, loading: false })
        return data
      })
      .catch((error) => {
        if (id === runId.current) setState((current) => ({ ...current, error, loading: false }))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    run()
  }, [run])

  const setData = useCallback((updater) => {
    setState((current) => ({ ...current, data: typeof updater === 'function' ? updater(current.data) : updater }))
  }, [])

  return { ...state, reload: run, setData }
}

export const asArray = (value) => (Array.isArray(value) ? value : [])
