import Taro from '@tarojs/taro';
import { loadToken } from '../services/api';

export async function openChatFile(message, groupId = '') {
  if (!message?.fileUrl) return;
  Taro.showLoading({ title: '正在打开文件...' });
  try {
    if (process.env.TARO_ENV === 'h5') { window.open(message.fileUrl, '_blank', 'noopener,noreferrer'); return; }
    const messageId = message.id || message._id;
    if (!messageId) throw new Error('消息标识缺失，请刷新对话');
    const fileType = message.fileName?.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx', 'xlsx', 'pptx'].includes(fileType)) throw new Error('暂不支持此文件格式');
    const path = groupId
      ? `/in-app-service-groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/file`
      : `/messages/${encodeURIComponent(messageId)}/file`;
    const token = loadToken();
    if (!token) throw new Error('登录已过期，请重新登录');
    const response = await Taro.downloadFile({
      url: `https://jiaycare.com/api${path}`,
      header: { Authorization: `Bearer ${token}` },
      timeout: 60000,
    });
    if (response.statusCode !== 200 || !response.tempFilePath) throw new Error(`下载失败（${response.statusCode || '网络异常'}）`);
    // 微信临时文件通常没有扩展名，安卓的文档预览需要正确的本地后缀。
    const filePath = `${Taro.env.USER_DATA_PATH}/chat-${messageId}-${Date.now()}.${fileType}`;
    await new Promise((resolve, reject) => Taro.getFileSystemManager().copyFile({
      srcPath: response.tempFilePath, destPath: filePath, success: resolve,
      fail: error => reject(new Error(error?.errMsg || '本地文件保存失败')),
    }));
    await Taro.openDocument({ filePath, fileType, showMenu: true });
  } catch (error) {
    Taro.showModal({ title: '文件打开失败', content: error?.message || error?.errMsg || '请稍后重试', showCancel: false });
  } finally {
    Taro.hideLoading();
  }
}
