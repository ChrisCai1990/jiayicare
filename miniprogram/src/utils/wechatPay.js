import Taro from '@tarojs/taro';
import { paymentsAPI } from '../services/api';

export function requestWechatPayment(params) {
  if (!params?.package || !params?.paySign) return Promise.resolve();
  return Taro.requestPayment(params).catch((error) => {
    const cancelled = /cancel/i.test(error?.errMsg || '');
    throw new Error(cancelled ? '您已取消支付，订单仍可稍后继续支付' : (error?.errMsg || '微信支付失败，请重试'));
  });
}

export async function waitForPayment(orderId, attempts = 5) {
  for (let index = 0; index < attempts; index += 1) {
    const result = await paymentsAPI.status(orderId);
    if (result.data?.order?.paymentStatus === 'paid') return result.data.order;
    if (index < attempts - 1) await new Promise(resolve => setTimeout(resolve, 1200));
  }
  throw new Error('付款结果正在确认，请稍后在“我的订单”查看');
}
