import Taro from '@tarojs/taro';
import { loadToken } from '../services/api';

export async function openChatFile(message, groupId = '') {
  if (!message?.fileUrl) return;
  const image = /^image\/(jpeg|png|webp|gif)$/.test(message.fileMimeType || '');
  Taro.showLoading({ title: image ? '正在打开图片...' : '正在打开文件...' });
  try {
    if (process.env.TARO_ENV === 'h5') {
      if (image) await Taro.previewImage({ current: message.fileUrl, urls: [message.fileUrl] });
      else window.open(message.fileUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const messageId = message.id || message._id;
    if (!messageId) throw new Error('消息标识缺失，请刷新对话');
    const fileType = message.fileName?.split('.').pop()?.toLowerCase();
    if (image ? !['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileType) : !['pdf', 'docx', 'xlsx', 'pptx'].includes(fileType)) throw new Error('暂不支持此文件格式');
    const path = groupId
      ? `/in-app-service-groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/file`
      : `/messages/${encodeURIComponent(messageId)}/file`;
    const token = loadToken();
    if (!token) throw new Error('登录已过期，请重新登录');
    const response = await Taro.request({
      url: `https://jiaycare.com/api${path}`,
      header: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    if (response.statusCode !== 200 || !(response.data instanceof ArrayBuffer) || !response.data.byteLength)
      throw new Error(response.statusCode === 401 ? '登录已过期，请重新登录' : `下载失败（${response.statusCode || '网络异常'}）`);
    // 复用已配置的 API request 域名，避免微信单独的 downloadFile 域名配置影响真机。
    const filePath = `${Taro.env.USER_DATA_PATH}/chat-${messageId}-${Date.now()}.${fileType}`;
    await new Promise((resolve, reject) => Taro.getFileSystemManager().writeFile({
      filePath, data: response.data, success: resolve,
      fail: error => reject(new Error(error?.errMsg || '本地文件保存失败')),
    }));
    if (image) await Taro.previewImage({ current: filePath, urls: [filePath] });
    else await Taro.openDocument({ filePath, fileType, showMenu: true });
  } catch (error) {
    Taro.showModal({ title: image ? '图片打开失败' : '文件打开失败', content: error?.message || error?.errMsg || '请稍后重试', showCancel: false });
  } finally {
    Taro.hideLoading();
  }
}
