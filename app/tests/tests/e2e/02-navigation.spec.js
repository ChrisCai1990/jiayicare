/**
 * 导航测试 — 底部 Tab + 页面内容验证
 *
 * React Native Web 把底部 Tab 标签做了 CSS visibility 处理，
 * 必须用坐标或 JS eval 点击，不能用 getByText().isVisible()。
 *
 * 视口 390×844，底部 5 个 Tab（从左到右）：
 *   首页 | 健康档案 | 随访 | 消息 | 我的
 *   x≈39  x≈117    x≈195 x≈273  x≈351   y≈820
 */
const { test, expect } = require('@playwright/test');

const TAB_Y = 820;
const TABS = {
  首页:    { x: 39  },
  健康档案: { x: 117 },
  随访:    { x: 195 },
  消息:    { x: 273 },
  我的:    { x: 351 },
};

async function enterDemoMode(page) {
  await page.goto('/');
  await page.waitForTimeout(2500);
  const btn = page.getByText(/一键演示体验/i);
  if (!await btn.isVisible({ timeout: 6000 }).catch(() => false)) return false;
  await btn.click();
  await page.waitForTimeout(4000);
  return true;
}

async function clickTab(page, name) {
  const tab = TABS[name];
  if (!tab) return false;
  await page.mouse.click(tab.x, TAB_Y);
  await page.waitForTimeout(2000);
  return true;
}

// 查找页面内 visible 的文字
async function hasVisibleText(page, regex) {
  // 用 JS 遍历 DOM，找到实际可见的文本节点
  return await page.evaluate((pattern) => {
    const re = new RegExp(pattern, 'i');
    const walk = (el) => {
      if (!el || el.hidden) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      if (el.nodeType === Node.TEXT_NODE) return re.test(el.textContent);
      for (const child of el.childNodes) {
        if (walk(child)) return true;
      }
      return false;
    };
    return walk(document.body);
  }, regex.source);
}

test.describe('底部导航 — 各 Tab 可达性', () => {

  test('首页 — 显示健康指标区块', async ({ page }) => {
    const ok = await enterDemoMode(page);
    if (!ok) { test.skip(true, '需要演示模式入口'); return; }

    // 首页应该已在视口内
    expect(await hasVisibleText(page, /健康指标/)).toBe(true);
  });

  test('健康档案 — 实时数据正确渲染（血压数值）', async ({ page }) => {
    const ok = await enterDemoMode(page);
    if (!ok) { test.skip(true, '需要演示模式入口'); return; }

    await clickTab(page, '健康档案');
    // 滚动进入指标网格
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(800);

    // 血压卡片 "xxx/xx" 格式
    expect(await hasVisibleText(page, /\d{2,3}\/\d{2,3}/)).toBe(true);
  });

  test('随访 — 显示提醒列表', async ({ page }) => {
    const ok = await enterDemoMode(page);
    if (!ok) { test.skip(true, '需要演示模式入口'); return; }

    await clickTab(page, '随访');
    expect(await hasVisibleText(page, /提醒|随访|服药|复诊|暂无/)).toBe(true);
  });

  test('消息中心 — 显示 AI 健康助手入口', async ({ page }) => {
    const ok = await enterDemoMode(page);
    if (!ok) { test.skip(true, '需要演示模式入口'); return; }

    await clickTab(page, '消息');
    expect(await hasVisibleText(page, /消息中心|AI 健康|AI健康/)).toBe(true);
  });

  test('我的 — 显示用户信息', async ({ page }) => {
    const ok = await enterDemoMode(page);
    if (!ok) { test.skip(true, '需要演示模式入口'); return; }

    await clickTab(page, '我的');
    expect(await hasVisibleText(page, /李明|服务包|年度服务|个人信息/)).toBe(true);
  });

  test('用药管理 — 通过首页快捷服务进入', async ({ page }) => {
    const ok = await enterDemoMode(page);
    if (!ok) { test.skip(true, '需要演示模式入口'); return; }

    // 首页快捷服务「用药计划」按钮
    const btn = page.getByText(/用药计划/i).first();
    if (!await btn.isVisible({ timeout: 4000 }).catch(() => false)) {
      // 尝试滚动到该按钮
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
    }
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(2000);
      expect(await hasVisibleText(page, /用药管理|今日服药|苯磺酸|阿托伐|暂无用药/)).toBe(true);
    } else {
      test.skip(true, '首页未显示用药计划按钮');
    }
  });

});
