/* Additive entry for the published H5 baseline. No application bundle changes.
 * This script also ships through src/index.html on subsequent H5 builds. */
(function () {
  'use strict';
  function update() {
    const onLogin = location.hash.split('?')[0] === '#/pages/auth/login/index';
    if (!onLogin) return;
    if (location.pathname.startsWith('/mobile-preview/review/')) {
      if (!new URLSearchParams(location.hash.split('?')[1] || '').has('password')) {
        location.replace('/mobile-preview/demo/');
      }
      return;
    }
    const nodes = document.querySelectorAll('taro-text-core,span');
    for (const node of nodes) {
      if (node.textContent.trim() !== '测试账号登录' || node.dataset.demoEntry) continue;
      node.dataset.demoEntry = 'true';
      node.textContent = '进入演示（免登录）';
      // Put the entry in normal flow so it cannot cover the logo on small screens.
      Object.assign(node.style, { fontSize: '18px', lineHeight: '28px', padding: '8px 12px',
        position: 'relative', display: 'block', margin: '0 0 20px', top: 'auto', right: 'auto',
        color: '#fff', background: '#1e6b50', borderRadius: '10px', zIndex: '2' });
      node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0');
      const enter = event => { event.preventDefault(); event.stopImmediatePropagation(); location.assign('/mobile-preview/demo/'); };
      node.addEventListener('click', enter, true);
      node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') enter(event); }, true);
    }
  }
  new MutationObserver(update).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', update);
  update();
}());
