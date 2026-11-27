export function returnTarget(historyIndex, fallback) {
  return Number.isInteger(historyIndex) && historyIndex > 0 ? -1 : fallback
}

export function returnToEntry(navigate, fallback) {
  const target = returnTarget(window.history.state?.idx, fallback)
  if (target === -1) navigate(-1)
  else navigate(target, { replace: true })
}
