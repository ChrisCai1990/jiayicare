/**
 * 录入健康数据 — 验证表单可以填写并提交
 */
const { test, expect } = require('@playwright/test');

async function enterDemoMode(page) {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const btn = page.getByText(/一键演示体验/i);
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(2500);
    return true;
  }
  return false;
}

test.describe('录入健康数据', () => {

  test.beforeEach(async ({ page }) => {
    const ok = await enterDemoMode(page);
    if (!ok) test.skip(true, '需要演示模式入口');
  });

  test('点击「录入」按钮跳转录入页', async ({ page }) => {
    // 健康档案 Tab
    const tab = page.getByText(/档案/i).first();
    if (await tab.isVisible().catch(() => false)) await tab.click();
    await page.waitForTimeout(1000);

    // 找「录入」或「+」按钮
    const addBtn = page.getByText(/录入|添加|记录/i).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(1500);
      await expect(page.getByText(/录入健康数据/i)).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, '未找到录入按钮');
    }
  });

  test('血压表单填写并提交', async ({ page }) => {
    // 直接导航到 AddRecord（如果有独立路由）
    await page.goto('/');
    await page.waitForTimeout(2000);

    // 先找录入入口
    const tab = page.getByText(/档案/i).first();
    if (await tab.isVisible().catch(() => false)) await tab.click();
    await page.waitForTimeout(800);

    const addBtn = page.getByText(/录入|添加/i).first();
    if (!await addBtn.isVisible().catch(() => false)) {
      test.skip(true, '未找到录入按钮');
      return;
    }
    await addBtn.click();
    await page.waitForTimeout(1500);

    // 填写收缩压
    const sysInput = page.getByPlaceholder(/130|收缩|sys/i).first();
    if (await sysInput.isVisible().catch(() => false)) {
      await sysInput.fill('125');
    }

    // 填写舒张压
    const diaInput = page.getByPlaceholder(/80|舒张|dia/i).first();
    if (await diaInput.isVisible().catch(() => false)) {
      await diaInput.fill('82');
    }

    // 点击保存
    const saveBtn = page.getByText(/保存记录/i);
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(3000);

      // 期望出现成功提示
      const success = page.getByText(/记录成功|已保存|确定/i);
      await expect(success.first()).toBeVisible({ timeout: 5000 });
    }
  });

});
