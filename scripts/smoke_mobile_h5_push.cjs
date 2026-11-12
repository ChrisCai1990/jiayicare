const assert = require('node:assert/strict');
const { chromium } = require('../../apple-ios-build3-20261019/node_modules/playwright');

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      localStorage.setItem('jy_token', JSON.stringify({ data: 'push-smoke-token' }));
      localStorage.setItem('jy_user', JSON.stringify({ data: JSON.stringify({ _id: 'push-smoke-user', name: '测试用户' }) }));
      window.__JIAYICARE_NATIVE_BRIDGE__ = 'v1';
      window.__nativeActions = [];
      window.ReactNativeWebView = { postMessage(raw) {
        const message = JSON.parse(raw);
        window.__nativeActions.push(message.action);
        const data = message.action === 'request-push-token' || message.action === 'refresh-push-token'
          ? { provider: 'apns', token: 'a'.repeat(64) }
          : message.action === 'set-push-badge' ? { nativeCallCompleted: true, count: message.payload.count } : false;
        queueMicrotask(() => window.dispatchEvent(new CustomEvent('jiayicare:native-response', {
          detail: { requestId: message.requestId, ok: true, data },
        })));
      } };
    });
    const registrations = [];
    await context.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let result = { success: true, data: [] };
      if (path === '/api/user/me') result = { success: true, data: { _id: 'push-smoke-user', name: '测试用户' } };
      if (path === '/api/push-devices/capabilities') result = { success: true, data: { enabled: true, providers: ['apns'] } };
      if (path === '/api/push-devices' && request.method() === 'PUT') {
        registrations.push(JSON.parse(request.postData()));
      }
      if (path === '/api/messages/unread-count') result = { success: true, count: 1 };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    await context.route('**/mobile-preview/demo/entry.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8765/mobile-preview/#/pages/profile/notifications/index');
    await page.waitForTimeout(1200);
    await page.getByText('开启 / 重新绑定').click();
    await page.getByText('设备已绑定。新服务消息将发送系统通知。').waitFor();
    assert.deepEqual(registrations, [{ provider: 'apns', token: 'a'.repeat(64) }]);
    const actions = await page.evaluate(() => window.__nativeActions);
    assert.ok(actions.includes('request-push-token'));
    assert.ok(actions.includes('set-push-badge'));
    assert.deepEqual(errors, []);
    console.log('H5 APNs binding and badge bridge passed');
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
