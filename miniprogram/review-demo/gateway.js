/* Standalone entry: no password, no production token, no URL-carried session. */
(function () {
  'use strict';
  const consent = document.getElementById('consent');
  const button = document.getElementById('enter');
  const error = document.getElementById('error');
  let busy = false;
  consent.addEventListener('change', () => { button.disabled = busy || !consent.checked; });
  // A fast tap or browser form restoration may precede this external script.
  button.disabled = !consent.checked;
  button.addEventListener('click', async () => {
    if (busy || !consent.checked) return;
    busy = true; button.disabled = true; button.textContent = '正在准备演示资料…'; error.textContent = '';
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 30000);
    let token;
    try {
      const response = await fetch('/review-api/auth/review-account/demo', { method: 'POST', credentials: 'omit',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: 'synthetic-demo-v1' }), signal: abort.signal });
      const result = await response.json();
      if (!response.ok || !result.success || result.data?.environment !== 'isolated-review' || !result.data.token) {
        throw new Error(result.message || '暂时无法进入演示，请重试');
      }
      token = result.data.token;
      const profile = await fetch('/review-api/user/me', { credentials: 'omit', headers: { Authorization: 'Bearer ' + token }, signal: abort.signal });
      const data = await profile.json();
      if (!profile.ok || !data.success || !data.data) throw new Error('演示资料加载失败，请重试');
      // Taro 3 H5 stores values wrapped in {data}; keep the review namespace.
      localStorage.setItem('review:jy_token', JSON.stringify({ data: token }));
      localStorage.setItem('review:jy_user', JSON.stringify({ data: JSON.stringify(data.data) }));
      window.location.replace('/mobile-preview/review/#/pages/home/index');
    } catch (e) {
      if (token) fetch('/review-api/auth/session/activity', { method: 'POST', credentials: 'omit', headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ event: 'logout' }) }).catch(() => {});
      error.textContent = e.name === 'AbortError' ? '连接超时，请检查网络后重试' : e.message;
      busy = false; button.disabled = !consent.checked; button.textContent = '进入演示';
    } finally { clearTimeout(timer); }
  });
}());
