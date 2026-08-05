import Taro from '@tarojs/taro';

export async function getVirtualPaymentLoginCode() {
  const result = await Taro.login();
  if (!result?.code) throw new Error('未能取得微信支付登录凭证，请重试');
  return result.code;
}

export function requestVirtualPayment(payment) {
  if (!payment) return Promise.resolve();
  const api = Taro.requestVirtualPayment || (typeof wx !== 'undefined' && wx.requestVirtualPayment);
  if (!api) return Promise.reject(new Error('当前微信版本不支持小程序虚拟支付，请升级微信后重试'));
  return new Promise((resolve, reject) => {
    api({
      mode: payment.mode,
      signData: payment.signData,
      paySig: payment.paySig,
      signature: payment.signature,
      success: resolve,
      fail: (error) => {
        const cancelled = /cancel/i.test(error?.errMsg || '');
        reject(new Error(cancelled ? '您已取消支付，订单保持未支付状态' : (error?.errMsg || '微信虚拟支付失败，请重试')));
      },
    });
  });
}
