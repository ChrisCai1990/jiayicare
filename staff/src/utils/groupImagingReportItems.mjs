const text = value => String(value || '').trim()
const compact = value => text(value).replace(/[\s，,。；;：:、（）()\[\]【】]/g, '')
const narrative = item => [item.findings || item.value, item.diagnosis, item.conclusion].map(compact)

function sameContext(a, b) {
  if (a.itemId && b.itemId && a.itemId !== b.itemId) return false
  if ((!a.itemId || !b.itemId) && compact(a.name) !== compact(b.name)) return false
  if (a.examDate && b.examDate && a.examDate !== b.examDate) return false
  if (a.institution && b.institution && a.institution !== b.institution) return false
  return true
}

function sameExamination(a, b) {
  if (!sameContext(a, b)) return false
  const first = narrative(a), second = narrative(b)
  if (!first.some(Boolean) || !second.some(Boolean)) return false
  if (first.every((part, index) => part === second[index])) return true

  // 汇总页与详细单页必须有不同来源页，且较短一侧的实质文字都能在详细页找到。
  // 改写过的结论、不同测量值等不能仅凭项目名称自动合并。
  if (!a.sourcePage || !b.sourcePage || Number(a.sourcePage) === Number(b.sourcePage)) return false
  const aText = first.filter(Boolean).join(''), bText = second.filter(Boolean).join('')
  const short = aText.length <= bText.length ? first : second
  const long = aText.length <= bText.length ? bText : aText
  return short.some(part => part.length >= 8)
    && short.filter(part => part.length >= 8).every(part => long.includes(part))
    && long.length > short.join('').length
}

export function groupImagingReportItems(items = []) {
  const groups = []
  items.forEach(item => {
    const group = groups.find(entry => entry.items.some(existing => sameExamination(existing, item)))
    if (group) group.items.push(item)
    else groups.push({ items: [item] })
  })
  return groups.map(group => ({
    ...group,
    primary: group.items.slice().sort((a, b) =>
      narrative(b).join('').length - narrative(a).join('').length)[0],
    sourcePages: [...new Set(group.items.map(item => Number(item.sourcePage)).filter(Boolean))].sort((a, b) => a - b),
  }))
}
