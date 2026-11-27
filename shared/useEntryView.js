import { useLayoutEffect, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

import { views } from './entryViews.mjs'

// Keep view choices in this running app only. Each browser history entry has
// its own snapshot, including two visits to the same URL.
export function useEntryView(field, initial) {
  const location = useLocation()
  const action = useNavigationType()
  const url = location.pathname + location.search + location.hash
  const key = location.key + ':' + url
  const read = () => views.get(key)?.[field] ?? (typeof initial === 'function' ? initial() : initial)
  const [entry, setEntry] = useState({ key, url })
  const [value, setValue] = useState(read)
  if (entry.key !== key) {
    setEntry({ key, url })
    if (action !== 'REPLACE' || entry.url !== url) setValue(read)
  }

  useLayoutEffect(() => {
    if (!views.has(key)) {
      if (views.size >= 100) views.delete(views.keys().next().value)
      views.set(key, {})
    }
    views.get(key)[field] = value
  }, [key, field, value])
  return [value, setValue]
}
