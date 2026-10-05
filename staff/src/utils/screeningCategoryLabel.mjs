// Display historical screening labels under the current admin category name.
// Only explicit names and aliases within the same top-level category are used.
// Ambiguous aliases stay separate so distinct examinations are never combined.
export function resolveScreeningCategory(tree, l1Id, historicalLabel) {
  const original = String(historicalLabel || '').trim()
  const parent = (tree || []).find(node => String(node._id) === String(l1Id))
  if (!original) return { l1Id: parent ? String(parent._id) : '', label: original }
  const key = original.toLocaleLowerCase('zh-CN')
  const parents = parent ? [parent] : (tree || [])
  const matches = parents.flatMap(node => (node.catalogLabels || node.children || [])
    .filter(child => [child.label, ...(child.aliases || [])].some(value =>
      String(value || '').trim().toLocaleLowerCase('zh-CN') === key
    ))
    .map(child => ({ l1Id: String(node._id), label: child.label })))
  return matches.length === 1 ? matches[0] : { l1Id: parent ? String(parent._id) : '', label: original }
}

export function screeningCategoryLabel(tree, l1Id, historicalLabel) {
  return resolveScreeningCategory(tree, l1Id, historicalLabel).label
}
