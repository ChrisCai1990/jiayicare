const sourceSectionKey = item => String(item?.sourceSection || item?.orderName || '').trim()

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
