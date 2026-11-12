export function isNativeApp() {
  return process.env.TARO_ENV === 'h5' && typeof window !== 'undefined'
    && !/^\/mobile-preview\/review(?:\/|$)/.test(window.location.pathname)
    && window.__JIAYICARE_NATIVE_BRIDGE__ === 'v1'
    && typeof window.ReactNativeWebView?.postMessage === 'function';
}

let sequence = 0;
export function callNative(action, payload = {}, timeoutMs = 60000) {
  if (!isNativeApp()) return Promise.reject(new Error('请在 App 中操作'));
  const requestId = `jy-${Date.now()}-${++sequence}`;
  return new Promise((resolve, reject) => {
    const onResponse = event => {
      const response = event.detail;
      if (response?.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener('jiayicare:native-response', onResponse);
      if (response.ok) resolve(response.data);
      else reject(new Error(response.message || 'App 操作失败'));
    };
    const timer = setTimeout(() => {
      window.removeEventListener('jiayicare:native-response', onResponse);
      reject(new Error('App 操作超时，请重试'));
    }, timeoutMs);
    window.addEventListener('jiayicare:native-response', onResponse);
    window.ReactNativeWebView.postMessage(JSON.stringify({ requestId, action, payload }));
  });
}
