import Taro from '@tarojs/taro';

export async function chooseImageWithPrivacy(options) {
  // 同一版本可能因用户是否已同意最新版《小程序隐私保护指引》而表现不同。
  // 先让微信同步当前用户的隐私授权；已同意时会立即成功，未同意时由微信
  // 展示官方弹窗。旧基础库没有此 API，继续使用原有 chooseImage 流程。
  if (typeof Taro.requirePrivacyAuthorize === 'function') {
    await Taro.requirePrivacyAuthorize();
  }
  return Taro.chooseImage(options);
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
      content: '微信未能同步本机的图片隐私授权。请关闭小程序后重新进入再试；仍无法使用时，请在微信中删除该小程序的最近使用记录后重新打开。',
      showCancel: false,
      confirmText: '我知道了',
    });
    return;
  }
  Taro.showToast({ title: fallback, icon: 'none' });
}
