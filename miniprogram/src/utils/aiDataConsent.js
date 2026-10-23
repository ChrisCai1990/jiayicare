import Taro from '@tarojs/taro';
import { aiDataConsentAPI } from '../services/api';

export async function ensureAiDataConsent(purpose, { cancelText = '暂不使用' } = {}) {
  let result;
  try { result = await aiDataConsentAPI.list(); }
  catch { Taro.showToast({ title: '授权状态暂不可用，本次不使用AI或语音处理', icon: 'none' }); return false; }
  const item = result.data?.find(row => row.purpose === purpose);
  if (!item || !item.available) return false;
  if (item.granted) return true;
  const decision = await Taro.showModal({ title: item.title,
    content: `接收方：${item.recipient}\n发送资料：${item.data}\n用途：${item.use}\n${item.optional}\n可在会话页“AI与语音授权”查看政策和撤回。`,
    confirmText: '同意使用', cancelText,
  });
  if (!decision.confirm) return false;
  await aiDataConsentAPI.update(purpose, { subjectId: item.subjectId, granted: true, version: item.version, revision: item.revision });
  return true;
}

export async function manageAiDataConsent() {
  try {
    const result = await aiDataConsentAPI.list();
    const rows = result.data || [];
    const selected = await Taro.showActionSheet({ itemList: rows.map(row => `${row.title} · ${row.granted ? '已同意' : '未开启'}`) });
    const item = rows[selected.tapIndex];
    if (!item) return;
    const action = await Taro.showActionSheet({ itemList: ['查看资料、接收方和用途', '查看接收方隐私政策', item.granted ? '撤回该项授权' : '开启该项授权'] });
    if (action.tapIndex === 0) {
      await Taro.showModal({ title: item.title, content: `接收方：${item.recipient}\n发送资料：${item.data}\n用途：${item.use}\n${item.optional}`, showCancel: false });
    } else if (action.tapIndex === 1) {
      openReferenceUrl(item.policyUrl);
    } else if (item.granted) {
      const confirm = await Taro.showModal({ title: '撤回授权', content: '撤回后停止本项后续第三方处理，人工服务仍可使用。已发送的数据不能通过本操作收回。', confirmText: '撤回授权' });
      if (!confirm.confirm) return;
      await aiDataConsentAPI.update(item.purpose, { subjectId: item.subjectId, granted: false, version: item.version, revision: item.revision });
      Taro.showToast({ title: '已撤回授权', icon: 'none' });
    } else await ensureAiDataConsent(item.purpose);
  } catch (e) { if (!/cancel/.test(e.errMsg || '')) Taro.showToast({ title: e.message || '授权设置暂不可用', icon: 'none' }); }
}

export function openReferenceUrl(url) {
  const allowed = /^https:\/\/(www\.who\.int|help\.aliyun\.com|terms\.alicdn\.com)\//;
  if (!allowed.test(String(url))) return;
  if (process.env.TARO_ENV === 'h5' && typeof window !== 'undefined') {
    // Top-level navigation also works after asynchronous action-sheet choices;
    // popup windows may be blocked. Native WebView delegates to the system browser.
    window.location.assign(url);
  } else Taro.setClipboardData({ data: url }).then(() => Taro.showModal({ title: '来源链接已复制', content: '请在浏览器粘贴打开，查看完整来源。', showCancel: false }));
}
