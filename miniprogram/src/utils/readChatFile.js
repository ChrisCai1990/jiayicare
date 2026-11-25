import Taro from '@tarojs/taro';

export async function readChatFile(path, file, pdf = false) {
  if (process.env.TARO_ENV === 'h5') {
    const blob = file instanceof Blob ? file : await (await fetch(path)).blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('读取文件失败，请重新选择'));
      reader.readAsDataURL(blob);
    });
  }
  const data = await new Promise((resolve, reject) => Taro.getFileSystemManager().readFile({
    filePath:path, encoding:'base64', success:res=>resolve(res.data), fail:reject,
  }));
  const mime = pdf ? 'application/pdf' : /[.]png$/i.test(path) ? 'image/png' : /[.]webp$/i.test(path) ? 'image/webp' : /[.]hei[cf]$/i.test(path) ? 'image/heic' : 'image/jpeg';
  return 'data:' + mime + ';base64,' + data;
}
