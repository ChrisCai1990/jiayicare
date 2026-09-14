export function orderConversationMessages(messages = [], orderId, orderCreatedAt) {
  if (!orderId) return messages
  const id = String(orderId)
  const startsOrder = message => message.action?.type === 'order_planner_confirmation' && String(message.action.orderId || '') === id
  const ordered = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const promptIndex = ordered.findIndex(startsOrder)
  const createdAt = new Date(orderCreatedAt).getTime()
  const firstLinkedIndex = ordered.findIndex(message => String(message.action?.orderId || '') === id)
  // A legacy order may have no confirmation prompt. Anchor it at its first explicitly
  // linked message; using order creation time can hit another order's prompt first.
  const start = promptIndex >= 0 ? promptIndex : firstLinkedIndex >= 0 ? firstLinkedIndex : Number.isFinite(createdAt)
    ? ordered.findIndex(message => new Date(message.createdAt).getTime() >= createdAt)
    : -1
  if (start < 0) return []
  const nextOrder = ordered.findIndex((message, index) => index > start && message.action?.type === 'order_planner_confirmation' && String(message.action.orderId || '') !== id)
  return ordered.slice(start, nextOrder < 0 ? undefined : nextOrder).filter(message => {
    const markedOrder = message.action?.orderId
    return !markedOrder || String(markedOrder) === id
  })
}
