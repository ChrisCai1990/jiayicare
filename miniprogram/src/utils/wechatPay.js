import Taro from '@tarojs/taro';
import { paymentsAPI } from '../services/api';
import { callNative, isNativeApp } from './appBridge';

export function ensurePaymentPlatform() {
  if (process.env.TARO_ENV !== 'weapp' && !isNativeApp()) {
    throw new Error('当前 App 版本暂不支持微信支付，请勿重复下单；待支付接入完成后再购买');
  }
}

export async function preparePaymentPlatform() {
  ensurePaymentPlatform();
  if (!isNativeApp()) return;
  const capability = await paymentsAPI.capabilities();
  if (!capability?.data?.app) throw new Error('App 微信支付暂不可用，请稍后再试');
  await callNative('prepare-payment');
}

export function requestWechatPayment(params) {
  ensurePaymentPlatform();
  if (isNativeApp()) return callNative('wechat-pay', { params });
  if (!params?.package || !params?.paySign) return Promise.reject(new Error('微信支付信息不完整，请稍后在“我的订单”继续支付'));
  return Taro.requestPayment(params).catch((error) => {
    const cancelled = /cancel/i.test(error?.errMsg || '');
    throw new Error(cancelled ? '您已取消支付，订单仍可稍后继续支付' : (error?.errMsg || '微信支付失败，请重试'));
  });
}

export async function waitForPayment(orderId, attempts = 5) {
  for (let index = 0; index < attempts; index += 1) {
    const result = await paymentsAPI.status(orderId);
    if (result.data?.order?.paymentStatus === 'paid' && result.data?.checkoutPaid !== false) return result.data.order;
    if (index < attempts - 1) await new Promise(resolve => setTimeout(resolve, 1200));
  }
  throw new Error('付款结果正在确认，请稍后在“我的订单”查看');
}
