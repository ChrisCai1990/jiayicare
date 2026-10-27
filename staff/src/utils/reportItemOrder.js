const sourceSectionKey = item => String(item?.sourceSection || item?.orderName || '').trim()

const normalizedSectionKey = item => sourceSectionKey(item)
  .replace(/^[\s【\[『「]+|[\s】\]』」]+$/g, '')
  .replace(/\s+/g, '')

// A page supplement may restart section numbers for each crop. The stored
// array retains first appearance, so use that to group sections for review.
export function orderReportItemsForReview(indexed) {
  const firstSectionIndex = new Map()
  const sectionOrder = new Map()
  indexed.forEach(({ it }, index) => {
    const key = normalizedSectionKey(it)
    if (!firstSectionIndex.has(key)) firstSectionIndex.set(key, index)
    const order = Number(it.sourceSectionOrder)
    if (Number.isInteger(order) && order > 0 && (!sectionOrder.has(key) || order < sectionOrder.get(key))) sectionOrder.set(key, order)
  })
  return [...indexed].sort((a, b) => {
    const aKey = normalizedSectionKey(a.it)
    const bKey = normalizedSectionKey(b.it)
    const declared = (sectionOrder.get(aKey) || Number.MAX_SAFE_INTEGER) - (sectionOrder.get(bKey) || Number.MAX_SAFE_INTEGER)
    if (declared) return declared
    const section = firstSectionIndex.get(aKey) - firstSectionIndex.get(bKey)
    if (section) return section
    const row = (Number(a.it.sourceRowOrder) || Number.MAX_SAFE_INTEGER) - (Number(b.it.sourceRowOrder) || Number.MAX_SAFE_INTEGER)
    return row || a.i - b.i
  })
}

export function sameReviewSection(left, right) {
  return normalizedSectionKey(left) === normalizedSectionKey(right)
}

const isSameSourceSection = (left, right) => (
  Number(left?.sourcePage || 0) === Number(right?.sourcePage || 0)
  && Number(left?.sourceSectionOrder || 0) === Number(right?.sourceSectionOrder || 0)
  && sourceSectionKey(left) === sourceSectionKey(right)
)

export function insertReportItemBelow(items, index, draft) {
  const current = items[index]
  if (!current) return items

  const currentRow = Number(current.sourceRowOrder)
  const insertedRow = Number.isFinite(currentRow) && currentRow > 0 ? currentRow + 1 : null
  const next = items.map((item, itemIndex) => {
    if (
      insertedRow
      && itemIndex !== index
      && isSameSourceSection(item, current)
      && Number(item.sourceRowOrder) >= insertedRow
    ) {
      return { ...item, sourceRowOrder: Number(item.sourceRowOrder) + 1 }
    }
    return item
  })

  const inserted = {
    ...draft,
    sourcePage: current.sourcePage || null,
    sourceSection: current.sourceSection || '',
    sourceSectionOrder: current.sourceSectionOrder || null,
    sourceRowOrder: insertedRow,
    orderName: current.orderName || '',
  }

  return [...next.slice(0, index + 1), inserted, ...next.slice(index + 1)]
}
