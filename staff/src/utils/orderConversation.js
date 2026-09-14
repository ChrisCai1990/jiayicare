export function orderConversationMessages(messages = [], orderId, orderCreatedAt) {
  if (!orderId) return messages
  const id = String(orderId)
  const startsOrder = message => message.action?.type === 'order_planner_confirmation' && String(message.action.orderId || '') === id
  const ordered = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const promptIndex = ordered.findIndex(startsOrder)
  const createdAt = new Date(orderCreatedAt).getTime()
  const firstLinkedIndex = ordered.findIndex(message => String(message.action?.orderId || '') === id)
  const createdIndex = Number.isFinite(createdAt)
    ? ordered.findIndex(message => new Date(message.createdAt).getTime() >= createdAt)
    : -1
  // Legacy orders may have no confirmation prompt. Recover customer replies sent
  // before the first tagged staff reply, but never cross a newer order prompt.
  let legacyStart = firstLinkedIndex
  if (firstLinkedIndex >= 0 && createdIndex >= 0 && createdIndex < firstLinkedIndex) {
    const interveningPrompt = ordered.findLastIndex((message, index) => index >= createdIndex && index < firstLinkedIndex
      && message.action?.type === 'order_planner_confirmation'
      && String(message.action.orderId || '') !== id)
    legacyStart = interveningPrompt >= 0 ? interveningPrompt + 1 : createdIndex
  }
  const start = promptIndex >= 0 ? promptIndex : firstLinkedIndex >= 0 ? legacyStart : createdIndex
  if (start < 0) return []
  const nextOrder = ordered.findIndex((message, index) => index > start && message.action?.type === 'order_planner_confirmation' && String(message.action.orderId || '') !== id)
  return ordered.filter((message, index) => {
    const markedOrder = message.action?.orderId
    // An explicitly linked staff reply belongs to this order even when it was
    // sent after another order prompt. Only untagged replies use the time window.
    if (markedOrder) return String(markedOrder) === id
    return index >= start && (nextOrder < 0 || index < nextOrder)
  })
}
