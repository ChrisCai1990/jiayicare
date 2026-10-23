import Taro from '@tarojs/taro';
import { reportsAPI } from '../services/api';

export async function openOriginalFile(report) {
  const fileCount = report.fileUrls?.length || (report.fileUrl ? 1 : 0);
  if (fileCount) {
    const isImage = report.mimeType?.startsWith('image/');
    Taro.showLoading({ title: '正在打开...' });
    try {
      const downloaded = await Promise.all(Array.from({ length: fileCount }, (_, index) => (
        reportsAPI.downloadOriginal(report._id, index, report.mimeType || '')
      )));
      Taro.hideLoading();
      if (isImage) {
        await Taro.previewImage({ urls: downloaded, current: downloaded[0] });
      } else {
        await Taro.openDocument({ filePath: downloaded[0], fileType: 'pdf', showMenu: true });
      }
    } catch (err) {
      Taro.hideLoading();
      Taro.showModal({
        title: '原始报告打开失败',
        content: err?.message || err?.errMsg || '无法打开原始文件，请稍后重试',
        showCancel: false,
        confirmText: '知道了',
      });
    }
    return;
  }
  if (report.hasContent) {
    try {
      const res = await reportsAPI.get(report._id);
      const full = res.data;
      if (!full?.content) throw new Error('原始文件内容为空');
      const mimeType = full.mimeType || '';
      const isImage = mimeType.startsWith('image/');
      const ext = mimeType === 'application/pdf' ? 'pdf'
        : mimeType.includes('png') ? 'png'
        : mimeType.includes('webp') ? 'webp' : 'jpg';
      const raw = String(full.content).replace(/^data:[^;]+;base64,/, '');
      const filePath = `${Taro.env.USER_DATA_PATH}/report-${report._id}.${ext}`;
      await new Promise((resolve, reject) => {
        Taro.getFileSystemManager().writeFile({
          filePath, data: raw, encoding: 'base64', success: resolve,
          fail: (err) => reject(new Error(err?.errMsg || '文件保存失败')),
        });
      });
      if (isImage) await Taro.previewImage({ urls: [filePath], current: filePath });
      else await Taro.openDocument({ filePath, fileType: 'pdf', showMenu: true });
    } catch (err) {
      Taro.showToast({ title: err?.message || '无法加载原始文件', icon: 'none' });
    }
    return;
  }
  Taro.showToast({ title: '该报告未上传原始文件', icon: 'none' });
}

