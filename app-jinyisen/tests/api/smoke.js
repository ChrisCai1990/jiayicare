/**
 * JiayiCare — API 冒烟测试
 * 纯 Node.js，无第三方依赖。
 *
 * 用法：
 *   node tests/api/smoke.js
 *   node tests/api/smoke.js --token=<JWT>    # 带登录态跑完整测试
 *
 * 退出码：0 = 全部通过，1 = 有失败
 */
const http = require('http');
const https = require('https');

const rawBaseUrl = process.env.API_BASE_URL;
if (!rawBaseUrl) {
  console.error('请先设置 API_BASE_URL（例如 http://127.0.0.1:3000）再运行 API 冒烟测试。');
  process.exit(2);
}
const BASE = new URL(rawBaseUrl);
const TOKEN = process.argv.find(a => a.startsWith('--token='))?.split('=')[1] || null;

// ── ANSI 颜色 ────────────────────────────────────────────────────
const GRN = '\x1b[32m✓\x1b[0m';
const RED = '\x1b[31m✗\x1b[0m';
const YEL = '\x1b[33m⚠\x1b[0m';
const DIM = '\x1b[2m';
const RST = '\x1b[0m';

let passed = 0, failed = 0, skipped = 0;
const results = [];

// ── HTTP 工具 ────────────────────────────────────────────────────
function req(method, path, body, extraHeaders = {}) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...extraHeaders,
    };
    const options = {
      hostname: BASE.hostname,
      port: BASE.port || undefined,
      path: `${BASE.pathname.replace(/\/$/, '')}/api${path}`,
      method, headers, timeout: 10000,
    };
    const client = BASE.protocol === 'http:' ? http : https;
    const r = client.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', e => resolve({ status: 0, error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: 'timeout' }); });
    if (payload) r.write(payload);
    r.end();
  });
}

// ── 断言工具 ─────────────────────────────────────────────────────
async function test(name, fn, needsAuth = false) {
  if (needsAuth && !TOKEN) {
    skipped++;
    results.push({ icon: YEL, name, detail: '跳过（需要 --token=<JWT>）' });
    return;
  }
  try {
    await fn();
    passed++;
    results.push({ icon: GRN, name });
  } catch (e) {
    failed++;
    results.push({ icon: RED, name, detail: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── 测试套件 ─────────────────────────────────────────────────────
async function run() {
  console.log('\n📋 JiayiCare API 冒烟测试');
  console.log(`   后端: ${BASE.origin}${BASE.pathname.replace(/\/$/, '')}/api`);
  console.log(`   Token: ${TOKEN ? TOKEN.slice(0, 20) + '…' : '未提供（部分测试将跳过）'}\n`);

  // ── 1. 健康检查（无需 auth）─────────────────────────────────────
  await test('服务器可达（health check）', async () => {
    const r = await req('GET', '/auth/send-code'); // 故意触发 400 而非 504
    assert(r.status !== 0, `服务器不可达: ${r.error}`);
    assert(r.status < 500, `服务器 5xx 错误: status=${r.status}`);
  });

  // ── 2. Auth ─────────────────────────────────────────────────────
  await test('POST /auth/send-code — 缺少手机号返回 400', async () => {
    const r = await req('POST', '/auth/send-code', {});
    assert(r.status === 400, `期望 400，实际 ${r.status}`);
  });

  await test('POST /auth/send-code — 无效手机号返回 400', async () => {
    const r = await req('POST', '/auth/send-code', { phone: '123' });
    assert(r.status === 400 || r.status === 422, `期望 400/422，实际 ${r.status}`);
  });

  await test('POST /auth/login — 缺少字段返回 400', async () => {
    const r = await req('POST', '/auth/login', { phone: '13800000000' });
    assert(r.status === 400 || r.status === 401, `期望 400/401，实际 ${r.status}`);
  });

  // ── 3. 受保护接口（无 token 应返回 401）────────────────────────
  const PROTECTED = [
    ['GET',  '/user/me'],
    ['GET',  '/user/dashboard'],
    ['GET',  '/records'],
    ['GET',  '/medications'],
    ['GET',  '/reminders'],
    ['GET',  '/messages'],
  ];

  for (const [method, path] of PROTECTED) {
    await test(`无 token: ${method} ${path} → 401`, async () => {
      const r = await req(method, path, null, { Authorization: 'Bearer invalid' });
      assert(r.status === 401, `期望 401，实际 ${r.status}`);
    });
  }

  // ── 4. 已登录接口 ────────────────────────────────────────────────
  await test('GET /user/me — 返回用户信息', async () => {
    const r = await req('GET', '/user/me');
    assert(r.status === 200, `期望 200，实际 ${r.status}: ${JSON.stringify(r.body).slice(0,100)}`);
    assert(r.body?.success, 'success 应为 true');
    assert(r.body?.data?.name || r.body?.data?.phone, '缺少 name/phone 字段');
  }, true);

  await test('GET /user/dashboard — 返回仪表盘数据', async () => {
    const r = await req('GET', '/user/dashboard');
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
    assert(r.body?.success, 'success 应为 true');
    const d = r.body?.data;
    assert(d, '缺少 data 字段');
    // latestVitals 可以为 null，但字段应存在
    assert('latestVitals' in d || 'user' in d, '缺少 latestVitals/user 字段');
  }, true);

  await test('GET /records — 返回记录列表', async () => {
    const r = await req('GET', '/records');
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
    assert(r.body?.success, 'success 应为 true');
    assert(Array.isArray(r.body?.data), 'data 应为数组');
  }, true);

  await test('GET /records/trend/bloodPressure — 返回趋势数据', async () => {
    const r = await req('GET', '/records/trend/bloodPressure');
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
    assert(r.body?.success, 'success 应为 true');
    assert(Array.isArray(r.body?.data), 'data 应为数组');
  }, true);

  await test('GET /medications — 返回用药列表', async () => {
    const r = await req('GET', '/medications');
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
    assert(r.body?.success, 'success 应为 true');
    assert(Array.isArray(r.body?.data), 'data 应为数组');
  }, true);

  await test('GET /reminders — 返回提醒列表', async () => {
    const r = await req('GET', '/reminders');
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
    assert(r.body?.success, 'success 应为 true');
    assert(Array.isArray(r.body?.data), 'data 应为数组');
  }, true);

  await test('GET /messages — 返回消息列表', async () => {
    const r = await req('GET', '/messages');
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
    assert(r.body?.success, 'success 应为 true');
    assert(Array.isArray(r.body?.data), 'data 应为数组');
  }, true);

  await test('POST /records — 录入血压记录', async () => {
    const r = await req('POST', '/records', {
      category: 'vitals',
      type: 'bloodPressure',
      label: '血压',
      value: '125/80',
      unit: 'mmHg',
      extra: { sys: 125, dia: 80 },
      status: 'normal',
    });
    // 201 = 创建成功；400/422 = 校验错误（字段问题）；500 = 服务器 bug
    assert(r.status === 200 || r.status === 201,
      `期望 200/201，实际 ${r.status}: ${JSON.stringify(r.body).slice(0,120)}`);
    assert(r.body?.success, 'success 应为 true');
  }, true);

  // ── 输出结果 ──────────────────────────────────────────────────
  console.log('─'.repeat(52));
  for (const { icon, name, detail } of results) {
    console.log(` ${icon} ${name}`);
    if (detail) console.log(`   ${DIM}${detail}${RST}`);
  }
  console.log('─'.repeat(52));
  const total = passed + failed + skipped;
  console.log(
    ` 共 ${total} 项 | ${GRN} ${passed} 通过 | ${failed > 0 ? RED : ''} ${failed} 失败${RST} | ${YEL} ${skipped} 跳过\n`
  );

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
