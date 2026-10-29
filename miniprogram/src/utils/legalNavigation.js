// Legal documents may be entered from the standalone demo page, without a Taro stack.
export function returnFromLegal({ taro, from, browser }) {
  const fallback = () => {
    let demoOrigin = from === 'demo';
    if (browser && !demoOrigin) {
      try {
        const referrer = new URL(browser.document.referrer);
        demoOrigin = referrer.origin === browser.location.origin &&
          referrer.pathname === '/mobile-preview/demo/';
      } catch (_) { /* Direct entry has no referrer. */ }
    }
    if (browser && demoOrigin) {
      // Fixed same-origin destination; never navigate to an arbitrary query/referrer URL.
      browser.location.replace('/mobile-preview/demo/');
      return;
    }
    return taro.redirectTo({ url: '/pages/auth/login/index' });
  };
  if (taro.getCurrentPages().length > 1) {
    return taro.navigateBack({ delta: 1, fail: fallback });
  }
  return fallback();
}
