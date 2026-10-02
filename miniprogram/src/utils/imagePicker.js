import Taro from '@tarojs/taro';

export async function chooseImageWithPrivacy(options) {
  // 直接调用选图接口，由微信按当前隐私配置处理授权。
  // 不要在这里强制调用 requirePrivacyAuthorize：该前置调用在部分真机上会
  // 先于 chooseImage 失败，使原本可以正常选图的用户被阻断。
  return Taro.chooseImage(options);
}

// Taro H5 returns browser File/blob URLs; only the mini-program has a file system manager.
// Return the same data URL on both platforms so the report/health-record APIs stay shared.
export async function readSelectedImage(selection, index = 0) {
  const path = selection?.tempFilePaths?.[index];
  const item = selection?.tempFiles?.[index];
  if (!path && !item) throw new Error('未选中图片');
  // H5 chooseImage does not honor sizeType: ['compressed']; reject oversized
  // originals before converting them to a much larger base64 request body.
  if (Number(item?.size) > 15 * 1024 * 1024) {
    throw new Error('单张图片不能超过15MB，请压缩后再上传');
  }
  if (process.env.TARO_ENV === 'h5') {
    const file = item?.originalFileObj || item?.file || item;
    const blob = file instanceof Blob ? file : await fetch(path).then(response => {
      if (!response.ok) throw new Error('图片读取失败');
      return response.blob();
    });
    if (blob.size > 15 * 1024 * 1024) throw new Error('单张图片不能超过15MB，请压缩后再上传');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.readAsDataURL(blob);
    });
    const mimeType = /^data:([^;]+);base64,/.exec(data)?.[1] || blob.type || 'image/jpeg';
    return { path, mimeType, data, base64: data.split(',')[1] };
  }
  const base64 = Taro.getFileSystemManager().readFileSync(path, 'base64');
  const ext = (path.split('.').pop() || 'jpg').toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp'
    : (ext === 'heic' || ext === 'heif') ? 'image/heic' : 'image/jpeg';
  return { path, mimeType, base64, data: `data:${mimeType};base64,${base64}` };
}

export function isImagePickerCancelled(error) {
  return /cancel/i.test(error?.errMsg || error?.message || '');
}

export function isPrivacyDeclarationMissing(error) {
  return /api scope is not declared in the privacy agreement/i.test(error?.errMsg || error?.message || '');
}

export function showImagePickerError(error, fallback = '无法读取图片，请重试') {
  if (isImagePickerCancelled(error)) return;
  if (isPrivacyDeclarationMissing(error)) {
    Taro.showModal({
      title: '暂时无法选择图片',
      content: '当前小程序版本的图片隐私配置异常，暂时无法选择图片。请联系客服处理。',
      showCancel: false,
      confirmText: '我知道了',
    });
    return;
  }
  Taro.showToast({ title: fallback, icon: 'none' });
}
