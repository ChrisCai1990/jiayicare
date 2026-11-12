import Taro from '@tarojs/taro';
import { loadToken, pushDevicesAPI } from '../services/api';
import { callNative, isNativeApp } from './appBridge';

const KEY = 'jy_native_push_device';
let generation = 0;
function saved() {
  try { return Taro.getStorageSync(KEY) || null; } catch { return null; }
}
function remember(device) { Taro.setStorageSync(KEY, device); }
function forget() { try { Taro.removeStorageSync(KEY); } catch {} }
export function hasSystemPushOptIn() { return !!saved(); }

export async function enableSystemPush({ interactive = true } = {}) {
  if (!isNativeApp() || !loadToken()) throw new Error('请先在 App 登录');
  const start = generation;
  const capabilities = await pushDevicesAPI.capabilities();
  if (!capabilities?.data?.enabled) throw new Error('系统通知暂未开放');
  const device = await callNative(interactive ? 'request-push-token' : 'refresh-push-token');
  if (start !== generation || !loadToken()) return false;
  if (!capabilities.data.providers?.includes(device?.provider)) throw new Error('当前设备的通知通道尚未开放');
  if (device.provider !== 'apns' && device.provider !== 'huawei') throw new Error('通知设备类型无效');
  if (typeof device.token !== 'string' || !device.token || device.token.length > 4096) throw new Error('通知凭据无效');
  await pushDevicesAPI.register(device);
  if (start !== generation || !loadToken()) {
    await pushDevicesAPI.unregister(device).catch(() => {});
    return false;
  }
  remember(device);
  return true;
}

export async function restoreSystemPush() {
  if (!saved() || !isNativeApp() || !loadToken()) return;
  try { await enableSystemPush({ interactive: false }); } catch { /* Keep opt-in for retry. */ }
}

export async function disableSystemPush() {
  generation += 1;
  const device = saved();
  if (device && loadToken()) await pushDevicesAPI.unregister(device);
  forget();
}

export function forgetPushSession() {
  generation += 1;
  forget();
}
