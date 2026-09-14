export function orderConversationMessages(messages = [], orderId) {
  if (!orderId) return messages
  const id = String(orderId)
  const startsOrder = message => message.action?.type === 'order_planner_confirmation' && String(message.action.orderId || '') === id
  const ordered = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const start = ordered.findIndex(startsOrder)
  if (start < 0) return ordered.filter(message => String(message.action?.orderId || '') === id)
  const nextOrder = ordered.findIndex((message, index) => index > start && message.action?.type === 'order_planner_confirmation' && String(message.action.orderId || '') !== id)
  return ordered.slice(start, nextOrder < 0 ? undefined : nextOrder).filter(message => {
    const markedOrder = message.action?.orderId
    return !markedOrder || String(markedOrder) === id
  })
}
