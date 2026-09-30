import { Platform } from 'react-native';
import { paymentsAPI } from '../services/api';
import { finishCheckout } from './paymentFlow';

const appid = process.env.EXPO_PUBLIC_WECHAT_APP_APPID || '';
const universalLink = process.env.EXPO_PUBLIC_WECHAT_UNIVERSAL_LINK || '';
let registration;
let active = false;
function bounded(promise, ms = 15000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('微信未响应，请返回我的订单确认状态')), ms);
  })]).finally(() => clearTimeout(timer));
}
export async function prepareNativePayment() {
  if (process.env.EXPO_PUBLIC_WECHAT_APP_PAY_ENABLED !== 'true' || !/^wx[0-9a-f]{16}$/i.test(appid)) {
    throw new Error('App微信支付正在开通中，请稍后再试');
  }
  if (Platform.OS === 'ios' && !/^https:\/\//.test(universalLink)) throw new Error('微信支付回跳尚未配置');
  const capability = await paymentsAPI.capabilities();
  if (!capability?.data?.app) throw new Error('App微信支付暂不可用，请稍后再试');
  // Load only after an explicit purchase action; no SDK initialization on launch.
  const sdk = require('expo-native-wechat');
  if (!registration) registration = bounded(Promise.resolve(sdk.registerApp({ appid, universalLink }))).then(result => {
    if (result !== true && result?.success !== true) throw new Error('微信初始化失败，请重启App后再试');
  }).catch(error => { registration = null; throw error; });
  await registration;
  const installed = await bounded(sdk.isWechatInstalled());
  if (installed !== true && installed?.success !== true) throw new Error('请先安装微信后再支付');
}
export async function completeNativePayment(result) {
  if (active) throw new Error('已有付款正在确认，请稍后查看订单');
  active = true;
  try {
    return await finishCheckout(result, async params => {
      if (params.appId !== appid || params.package !== 'Sign=WXPay') throw new Error('微信支付参数与当前应用不匹配');
      const response = await bounded(require('expo-native-wechat').requestPayment(params), 120000);
      if (response?.errorCode !== 0) throw new Error('微信付款未确认');
    }, paymentsAPI.status);
  } finally { active = false; }
}
