export function orderConversationMessages(messages = [], orderId, orderCreatedAt) {
  if (!orderId) return messages
  const id = String(orderId)
  const startsOrder = message => message.action?.type === 'order_planner_confirmation' && String(message.action.orderId || '') === id
  const ordered = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const promptIndex = ordered.findIndex(startsOrder)
  const createdAt = new Date(orderCreatedAt).getTime()
  const firstLinkedIndex = ordered.findIndex(message => String(message.action?.orderId || '') === id)
  const start = promptIndex >= 0 ? promptIndex : Number.isFinite(createdAt)
    ? ordered.findIndex(message => new Date(message.createdAt).getTime() >= createdAt)
    : firstLinkedIndex
  if (start < 0) return []
  const nextOrder = ordered.findIndex((message, index) => index > start && message.action?.type === 'order_planner_confirmation' && String(message.action.orderId || '') !== id)
  return ordered.slice(start, nextOrder < 0 ? undefined : nextOrder).filter(message => {
    const markedOrder = message.action?.orderId
    return !markedOrder || String(markedOrder) === id
  })
}
