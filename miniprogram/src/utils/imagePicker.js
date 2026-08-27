import Taro from '@tarojs/taro';

export async function chooseImageWithPrivacy(options) {
  // 直接调用选图接口，由微信按当前隐私配置处理授权。
  // 不要在这里强制调用 requirePrivacyAuthorize：该前置调用在部分真机上会
  // 先于 chooseImage 失败，使原本可以正常选图的用户被阻断。
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
      content: '当前小程序版本的图片隐私配置异常，暂时无法选择图片。请联系客服处理。',
      showCancel: false,
      confirmText: '我知道了',
    });
    return;
  }
  Taro.showToast({ title: fallback, icon: 'none' });
}
