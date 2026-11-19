import Taro from '@tarojs/taro';

export async function openChatFile(message) {
  if (!message?.fileUrl) return;
  try {
    if (process.env.TARO_ENV === 'h5') { window.open(message.fileUrl, '_blank', 'noopener,noreferrer'); return; }
    const response = await Taro.downloadFile({ url: message.fileUrl });
    if (response.statusCode !== 200) throw new Error('下载失败');
    const fileType = message.fileName?.split('.').pop()?.toLowerCase();
    await Taro.openDocument({ filePath: response.tempFilePath, fileType, showMenu: true });
  } catch {
    Taro.showToast({ title: '文件暂时无法打开，请重试', icon: 'none' });
  }
}
