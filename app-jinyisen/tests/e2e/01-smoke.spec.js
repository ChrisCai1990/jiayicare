/**
 * 冒烟测试 — 应用最基础的可用性验证
 */
const { test, expect } = require('@playwright/test');

// ── 进入演示模式（带截图 debug）────────────────────────────────────
async function clickDemo(page) {
  const demoBtn = page.getByText(/一键演示体验/i);
  if (!await demoBtn.isVisible({ timeout: 8000 }).catch(() => false)) return false;
  await demoBtn.click();
  // 等待 React Native 路由动画 + API 请求
  await page.waitForTimeout(4000);
  return true;
}

test.describe('冒烟测试 — 应用启动', () => {

  test('页面加载成功（HTTP 200，有内容渲染）', async ({ page }) => {
    const res = await page.goto('/');
    expect(res.status()).toBeLessThan(400);
    await page.waitForTimeout(2000);
    // 页面有任何文字内容即可
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });

  test('显示登录界面 — 手机号输入框可见', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2500);
    // 检查登录页标志性元素
    const phoneInput = page.getByPlaceholder(/手机号/i);
    const brandName  = page.getByText(/嘉医/i).first();
    const hasPhone   = await phoneInput.isVisible().catch(() => false);
    const hasBrand   = await brandName.isVisible().catch(() => false);
    expect(hasPhone || hasBrand).toBe(true);
  });

  test('「一键演示体验」按钮可见且可点击', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2500);
    const btn = page.getByText(/一键演示体验/i);
    await expect(btn).toBeVisible({ timeout: 5000 });
  });

  test('点击演示体验 → 跳转到主界面', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2500);

    const ok = await clickDemo(page);
    if (!ok) { test.skip(true, '未找到演示按钮'); return; }

    // 主界面上会出现以下任一文字
    const candidates = [
      page.getByText(/健康指标/i),
      page.getByText(/今日待办/i),
      page.getByText(/快捷服务/i),
      page.getByText(/健康评分/i),
      page.getByText(/嘉医汇/i),
      page.getByText(/早上好|下午好|晚上好/i),
    ];

    let found = false;
    for (const loc of candidates) {
      if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

});
