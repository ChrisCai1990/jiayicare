// Display historical screening labels under the current admin category name.
// Only explicit names and aliases within the same top-level category are used.
// Ambiguous aliases stay separate so distinct examinations are never combined.
export function screeningCategoryLabel(tree, l1Id, historicalLabel) {
  const original = String(historicalLabel || '').trim()
  const parent = (tree || []).find(node => String(node._id) === String(l1Id))
  if (!parent || !original) return original
  const key = original.toLocaleLowerCase('zh-CN')
  const matches = (parent.children || []).filter(child =>
    [child.label, ...(child.aliases || [])].some(value => String(value || '').trim().toLocaleLowerCase('zh-CN') === key)
  )
  return matches.length === 1 ? matches[0].label : original
}
