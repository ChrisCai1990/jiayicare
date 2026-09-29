import { useCallback, useEffect, useRef, useState } from 'react'

// One request per resource at a time. Ignore responses from an old account/query
// or an unmounted page; failed refreshes retain the last successful snapshot.
export default function useWorkbenchResource(loader, key, initialData, enabled = true) {
  const revision = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const refreshRef = useRef(() => Promise.resolve())
  const [state, setState] = useState({ key, data: initialData, loading: enabled, error: '' })
  useEffect(() => {
    let active = true, running = null
    setState({ key, data: initialData, loading: enabled, error: '' })
    const refresh = () => {
      if (!enabled || !active) return Promise.resolve()
      if (running) return running
      const startedAtRevision = revision.current
      running = Promise.resolve().then(() => loaderRef.current()).then(data => {
        if (active && revision.current === startedAtRevision) setState({ key, data, loading: false, error: '' })
      }).catch(err => {
        if (active && revision.current === startedAtRevision) setState(previous => ({ ...previous, loading: false, error: err.message || '加载失败，请重试' }))
      }).finally(() => {
        running = null
        if (active && revision.current !== startedAtRevision) refresh()
      })
      return running
    }
    refreshRef.current = refresh
    refresh()
    const visibleRefresh = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', visibleRefresh)
    document.addEventListener('visibilitychange', visibleRefresh)
    const timer = window.setInterval(visibleRefresh, 30000)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', visibleRefresh)
      document.removeEventListener('visibilitychange', visibleRefresh)
    }
  }, [key, enabled])
  const refresh = useCallback(() => refreshRef.current(), [])
  const setData = useCallback(update => {
    revision.current++
    setState(previous => ({ ...previous, data: typeof update === 'function' ? update(previous.data) : update }))
  }, [])
  return { ...(state.key === key ? state : { data: initialData, loading: enabled, error: '' }), refresh, setData }
}
