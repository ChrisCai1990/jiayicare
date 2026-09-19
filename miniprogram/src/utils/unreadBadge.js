import Taro from '@tarojs/taro';
import { loadToken, messagesAPI } from '../services/api';

let generation = 0;
let reading = 0;
let lastCount = null;
let badgeWrites = Promise.resolve();

function writeBadge(count, version) {
  badgeWrites = badgeWrites.catch(() => {}).then(() => {
    if (version !== generation) return;
    return count > 0
      ? Taro.setTabBarBadge({ index: 2, text: String(Math.min(count, 99)) })
      : Taro.removeTabBarBadge({ index: 2 });
  }).catch(() => {});
  return badgeWrites;
}

export function resetUnreadBadge() {
  lastCount = null;
  return writeBadge(0, ++generation);
}

// Only the server's visible unread count writes the tab badge. List windows and
// failed/partial page requests must never replace it with a local count.
export async function refreshUnreadBadge({ notify = false } = {}) {
  if (reading) return;
  const token = loadToken();
  if (!token) return resetUnreadBadge();
  const version = ++generation;
  try {
    const res = await messagesAPI.unreadCount();
    if (version !== generation || token !== loadToken() || !res?.success) return;
    const count = Number(res.count);
    if (!Number.isFinite(count) || count < 0) return;
    if (notify && lastCount !== null && count > lastCount) {
      const sender = res.latestMessage?.sender || res.latestMessage?.title || '服务团队';
      Taro.showToast({ title: `${sender}发来新消息`, icon: 'none', duration: 2500 });
    }
    lastCount = count;
    await writeBadge(count, version);
  } catch { /* Keep the last confirmed count on a transient network failure. */ }
}

export async function withUnreadBadgeUpdate(action) {
  reading += 1;
  generation += 1; // Discard count requests started before the read operation.
  try { return await action(); }
  finally {
    reading -= 1;
    if (!reading) refreshUnreadBadge();
  }
}
