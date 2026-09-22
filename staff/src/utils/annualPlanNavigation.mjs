export function annualPlanReturnTarget(historyIndex, fallback) {
  // Router history preserves the entry page's query/tab, unlike a fixed list URL.
  // A direct link/new tab must stay in the app rather than leave for another site.
  return Number.isInteger(historyIndex) && historyIndex > 0 ? -1 : fallback
}
