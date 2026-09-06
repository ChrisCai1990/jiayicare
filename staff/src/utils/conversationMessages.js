const stableMessage = (message = {}) => {
  const { audioUrl, imageUrl, imageUrls, ...stable } = message
  return stable
}

// 轮询会刷新私有媒体签名。保留同一消息已加载的媒体地址，避免 audio 的 src
// 每次轮询都变化并从头加载；内容没有变化时直接保留原数组，避免重复滚动。
export function reconcileConversationMessages(previous = [], incoming = []) {
  const previousById = new Map(previous.map(message => [String(message._id), message]))
  const merged = incoming.map(message => {
    const old = previousById.get(String(message._id))
    if (!old) return message
    return {
      ...message,
      audioUrl: old.audioUrl || message.audioUrl,
      imageUrl: old.imageUrl || message.imageUrl,
      imageUrls: old.imageUrls?.length ? old.imageUrls : message.imageUrls,
    }
  })
  if (previous.length === merged.length && previous.every((message, index) =>
    String(message._id) === String(merged[index]?._id)
    && JSON.stringify(stableMessage(message)) === JSON.stringify(stableMessage(merged[index]))
  )) return previous
  return merged
}
