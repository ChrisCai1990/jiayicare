// Direct links and restored sessions may have no page to pop.
export async function returnToPrevious(taro, { destination } = {}) {
  try {
    if (!destination && (taro.getCurrentPages?.() || []).length > 1) {
      await taro.navigateBack({ delta: 1 });
      return;
    }
  } catch {}
  try {
    await taro.switchTab({ url: destination || '/pages/home/index' });
  } catch {
    try { await taro.reLaunch({ url: destination || '/pages/home/index' }); }
    catch { taro.showToast({ title: '返回未成功，请重试', icon: 'none' }); }
  }
}
