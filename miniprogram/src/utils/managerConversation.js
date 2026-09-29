import Taro from '@tarojs/taro';
import { userAPI } from '../services/api';

let pending = null;
let opening = false;
export async function openManagerConversation(userId) {
  if (opening) return;
  if (!userId) {
    await Taro.navigateTo({ url: '/pages/auth/login/index' });
    return;
  }
  opening = true;
  try {
    const response = await userAPI.getMe();
    if (!response?.success || String(response.data?._id) !== String(userId)) throw new Error('身份信息未能确认，请重新登录后重试');
    const member = (Array.isArray(response.data.careTeam) ? response.data.careTeam : []).find(item => item.kind === 'healthManager');
    if (!member) throw new Error('暂未分配健管专员，请在“我的”中查看服务团队');
    pending = { userId: String(userId), role: 'manager', member };
    await Taro.switchTab({ url: '/pages/chat/index' });
  } catch (error) {
    pending = null;
    Taro.showModal({ title: '联系健管专员', content: error.message || '暂时无法打开会话，请重试', showCancel: false });
  } finally { opening = false; }
}

export function consumeManagerConversation(userId) {
  const value = pending;
  pending = null;
  return value && value.userId === String(userId) ? value : null;
}
