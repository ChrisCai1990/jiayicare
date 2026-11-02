const stableMessage = (message = {}) => {
  const { audioUrl, imageUrl, imageUrls, ...stable } = message
  return stable
}

// OSS links returned by the conversation API expire after ten minutes. A thread
// can stay open much longer, so use the refreshed link once the old one is near
// expiry instead of preserving a broken image across every poll.
const usableMediaUrl = (oldUrl, newUrl, now = Date.now()) => {
  if (!oldUrl) return newUrl
  try {
    const expires = Number(new URL(oldUrl).searchParams.get('Expires'))
    if (expires && expires * 1000 <= now + 60_000) return newUrl || oldUrl
  } catch {}
  return oldUrl
}

const usableImageUrls = (oldUrls, newUrls) => {
  if (!oldUrls?.length) return newUrls
  if (!newUrls?.length || oldUrls.length !== newUrls.length) return newUrls
  return oldUrls.map((url, index) => usableMediaUrl(url, newUrls[index]))
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
      imageUrl: usableMediaUrl(old.imageUrl, message.imageUrl),
      imageUrls: usableImageUrls(old.imageUrls, message.imageUrls),
    }
  })
  if (previous.length === merged.length && previous.every((message, index) =>
    String(message._id) === String(merged[index]?._id)
    && JSON.stringify(stableMessage(message)) === JSON.stringify(stableMessage(merged[index]))
    && message.imageUrl === merged[index]?.imageUrl
    && JSON.stringify(message.imageUrls || []) === JSON.stringify(merged[index]?.imageUrls || [])
  )) return previous
  return merged
}
