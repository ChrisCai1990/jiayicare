// The hosted H5 page talks to its own authenticated API. The native shell only
// supplies platform capabilities; it never receives or stores the H5 session token.
export function isNativeApp() {
  return process.env.TARO_ENV === 'h5'
    && typeof window !== 'undefined'
    && window.__JIAYICARE_NATIVE_BRIDGE__ === 'v1'
    && typeof window.ReactNativeWebView?.postMessage === 'function';
}

let nextRequestId = 0;
export function callNative(action, payload = {}, timeoutMs = 130000) {
  if (!isNativeApp()) return Promise.reject(new Error('当前环境无法调用 App 功能'));
  const requestId = `jy-${Date.now()}-${++nextRequestId}`;
  return new Promise((resolve, reject) => {
    const onResponse = (event) => {
      const response = event.detail;
      if (response?.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener('jiayicare:native-response', onResponse);
      if (response.ok) resolve(response.data);
      else reject(new Error(response.message || 'App 操作失败，请重试'));
    };
    const timer = setTimeout(() => {
      window.removeEventListener('jiayicare:native-response', onResponse);
      reject(new Error('App 响应超时，请在我的订单核对状态'));
    }, timeoutMs);
    window.addEventListener('jiayicare:native-response', onResponse);
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ requestId, action, payload })); }
    catch (error) {
      clearTimeout(timer);
      window.removeEventListener('jiayicare:native-response', onResponse);
      reject(error);
    }
  });
}
