import Taro from '@tarojs/taro';

export async function chooseImageWithPrivacy(options) {
  // 直接调用选图接口，由微信按当前隐私配置处理授权。
  // 不要在这里强制调用 requirePrivacyAuthorize：该前置调用在部分真机上会
  // 先于 chooseImage 失败，使原本可以正常选图的用户被阻断。
  return Taro.chooseImage(options);
}

// H5 chooseImage returns browser URLs, while WeChat returns local file paths.
// The browser has no getFileSystemManager; read its Blob with FileReader instead.
export async function readSelectedImages(result, { maxDimension = 0 } = {}) {
  const paths = result.tempFilePaths || [];
  return Promise.all(paths.map(async (path, index) => {
    if (process.env.TARO_ENV === 'h5') {
      try {
        const blob = await (await fetch(path)).blob();
        if (maxDimension) {
          const photo = await new Promise((resolve, reject) => {
            const image = new window.Image();
            const timer = setTimeout(() => reject(new Error('照片处理超时，请重新选择')), 12000);
            image.onload = () => { clearTimeout(timer); resolve(image); };
            image.onerror = () => { clearTimeout(timer); reject(new Error('照片无法处理，请重新选择')); };
            image.src = path;
          });
          const scale = Math.min(1, maxDimension / Math.max(photo.naturalWidth, photo.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('照片无法处理，请重新选择');
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(photo, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL('image/jpeg', 0.82);
          if (!data.startsWith('data:image/jpeg;base64,')) throw new Error('照片无法处理，请重新选择');
          return { path, mimeType: 'image/jpeg', data };
        }
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
          reader.readAsDataURL(blob);
        });
        const mimeType = blob.type || result.tempFiles?.[index]?.type || 'image/jpeg';
        return { path, mimeType, data };
      } catch (error) {
        throw new Error(uploadErrorMessage(error, '图片读取失败，请重试'));
      }
    }
    const base64 = Taro.getFileSystemManager().readFileSync(path, 'base64');
    const ext = (path.split('.').pop() || 'jpg').toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp'
      : ext === 'heic' || ext === 'heif' ? 'image/heic' : 'image/jpeg';
    return { path, mimeType, data: `data:${mimeType};base64,${base64}` };
  }));
}

export function uploadErrorMessage(error, fallback = '上传失败，请重试') {
  const message = error?.message || error?.errMsg || '';
  return message && !/[A-Za-z]/.test(message) ? message : fallback;
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
  Taro.showToast({ title: uploadErrorMessage(error, fallback), icon: 'none' });
}
