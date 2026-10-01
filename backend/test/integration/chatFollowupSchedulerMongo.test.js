// Explicitly opted-in, isolated localhost database; never reads .env or calls a real AI.
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

test('chat scheduling: real Mongo concurrency, limits, failure and restart safety', {
  skip: process.env.RUN_CHAT_LOCAL_MONGO_TEST !== 'true', timeout: 60000,
}, async t => {
  const dbName = `jiayicare_chat_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(`mongodb://127.0.0.1:27962/${dbName}`, { autoIndex: false, serverSelectionTimeoutMS: 3000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const Job = require('../../src/models/ChatFollowupJob');
  const Schedule = require('../../src/models/ChatFollowupSchedule');
  const User = require('../../src/models/User');
  const Admin = require('../../src/models/Admin');
  const Message = require('../../src/models/Message');
  const Config = require('../../src/models/SystemConfig');
  const Record = require('../../src/models/ServiceRecord');
  let calls = 0, respond = async () => JSON.stringify({ title: '合成记录', content: '仅测试的聊天摘要', result: '待审核', nextDate: null });
  require.cache[require.resolve('../../src/utils/ai')] = { exports: { chat: async () => { calls++; return respond(); } } };
  const { generateChatFollowupDraft: generate } = require('../../src/utils/chatFollowupDraft');
  const { scanAndGenerateChatFollowupDrafts: scan, PERIOD, LIMIT } = require('../../src/utils/chatFollowupScheduler');
  const tenantId = new mongoose.Types.ObjectId(), staffId = new mongoose.Types.ObjectId();
  await Admin.collection.insertOne({ _id: staffId, role: 'nutritionist', staffStatus: 'active', tenantId });
  const seed = async (role = 'nutritionist') => {
    const patientId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({ _id: patientId, name: '隔离合成会员', assignedNutritionist: staffId, tenantId });
    await Message.collection.insertOne({ conversationId: `${patientId}_${role}`, content: '合成测试记录', type: 'user', createdAt: new Date(Date.now() - 1000) });
    return patientId;
  };
  const reset = async () => {
    for (const Model of [Job, Schedule, Message, Record, Config, User]) await Model.deleteMany({});
    calls = 0;
  };
  await t.test('first startup sets future date; repeated startup does not reset; disabled does not initialize', async () => {
    await Config.create({ key: 'chatFollowupAutoDraft', value: { enabled: false } });
    await scan(); assert.equal(await Schedule.countDocuments(), 0);
    await Config.deleteMany({});
    await scan(); const first = await Schedule.findOne().lean();
    assert.ok(first.nextRunAt - first.activatedAt === PERIOD);
    delete require.cache[require.resolve('../../src/utils/chatFollowupScheduler')];
    await require('../../src/utils/chatFollowupScheduler').scanAndGenerateChatFollowupDrafts();
    assert.equal(+(await Schedule.findOne()).nextRunAt, +first.nextRunAt); assert.equal(calls, 0);
  });
  await t.test('config read failure makes zero calls and no schedule changes', async () => {
    const previous = Config.findOne;
    Config.findOne = () => ({ lean: async () => { throw new Error('offline'); } });
    try { await assert.rejects(scan, /offline/); assert.equal(calls, 0); }
    finally { Config.findOne = previous; }
  });
  await t.test('two schedulers share five-call limit; persisted cursor resumes next hour, excludes retired roles', async () => {
    await reset();
    for (let i = 0; i < 8; i++) await seed();
    await seed('manager'); await seed('doctor');
    const start = new Date(Date.now() - 86400000);
    await Schedule.create({ _id: 'nutrition-chat-v1', activatedAt: start, cycleStart: start, nextRunAt: start });
    await Promise.all([scan(), scan()]);
    assert.equal(calls, LIMIT); assert.equal(await Record.countDocuments(), LIMIT);
    await scan(); assert.equal(calls, LIMIT);
    await Schedule.updateOne({}, { $set: { nextRunAt: start } });
    await scan(); assert.equal(calls, 8); assert.equal(await Record.countDocuments({ aiStatus: 'pending' }), 8);
    assert.equal((await Schedule.findOne()).cursor, '');
    assert.ok((await Schedule.findOne()).nextRunAt > new Date());
  });
  await t.test('manual and scheduled requests cannot create duplicate drafts', async () => {
    await reset(); const patientId = await seed();
    let release; respond = () => new Promise(resolve => { release = resolve; });
    const a = generate({ patientId, role: 'nutritionist', automaticCycle: 'cycle-a' });
    while (!release) await new Promise(resolve => setTimeout(resolve, 5));
    const b = await generate({ patientId, role: 'nutritionist' });
    assert.equal(b.status, 'skip'); assert.equal(calls, 1);
    release('{"content":"合成摘要"}'); assert.equal((await a).status, 'created');
    assert.equal((await generate({ patientId, role: 'nutritionist' })).status, 'reused');
    assert.equal(await Record.countDocuments(), 1); assert.equal(calls, 1);
  });
  await t.test('failure persists, automatic retry suppressed; explicit retry uses original window', async () => {
    await reset(); const patientId = await seed();
    respond = async () => { throw new Error('provider unavailable'); };
    const options = { patientId, role: 'nutritionist', automaticCycle: 'cycle-a', minimumRangeStart: new Date(Date.now() - 86400000), maximumRangeEnd: new Date() };
    assert.equal((await generate(options)).status, 'failed');
    assert.equal((await Job.findOne()).status, 'failed');
    await generate({ ...options, automaticCycle: 'cycle-b' }); assert.equal(calls, 1);
    respond = async () => '{"content":"恢复合成摘要"}';
    assert.equal((await generate({ patientId, role: 'nutritionist' })).status, 'created');
    assert.equal(calls, 2); assert.equal(+(await Record.findOne()).aiRangeStart, +options.minimumRangeStart);
  });
  await t.test('late AI response loses fence after human takeover', async () => {
    await reset(); const patientId = await seed();
    let release; respond = () => new Promise(resolve => { release = resolve; });
    const pending = generate({ patientId, role: 'nutritionist' });
    while (!release) await new Promise(resolve => setTimeout(resolve, 5));
    await Job.updateOne({}, { $set: { status: 'done', handlingNote: '已人工核对' } });
    release('{"content":"迟到输出"}');
    await assert.rejects(pending, /过期/); assert.equal(await Record.countDocuments(), 0);
  });
  await t.test('uncertain save cannot issue another AI call; persisted record can be reconciled', async () => {
    await reset(); const patientId = await seed(); const recordId = new mongoose.Types.ObjectId();
    await Job.create({ _id: `${patientId}_nutritionist`, patientId, status: 'committing', token: 'old', recordId, leaseUntil: new Date(0) });
    assert.equal((await generate({ patientId, role: 'nutritionist' })).status, 'skip'); assert.equal(calls, 0);
    await Record.create({ _id: recordId, patientId, type: 'nutrition', aiStatus: 'pending', content: '已保存' });
    assert.equal((await generate({ patientId, role: 'nutritionist' })).status, 'reused');
    assert.equal((await Job.findOne()).status, 'done');
  });
  await t.test('invalid role, malformed AI and excessive input do not create a record', async () => {
    await reset(); const patientId = await seed();
    assert.equal((await generate({ patientId, role: 'other' })).status, 'skip'); assert.equal(calls, 0);
    respond = async () => 'null'; assert.equal((await generate({ patientId, role: 'nutritionist' })).status, 'failed');
    await Message.updateMany({}, { $set: { content: 'x'.repeat(60001) } });
    assert.equal((await generate({ patientId, role: 'nutritionist' })).status, 'failed');
    assert.equal(calls, 1); assert.equal(await Record.countDocuments(), 0);
  });
  await t.test('actual routes enforce owner/tenant/role and versioned human closure', async () => {
    await reset(); const patientId = await seed();
    const fs = require('fs'), vm = require('vm');
    const source = fs.readFileSync(require.resolve('../../src/routes/staff'), 'utf8');
    const handlers = {};
    const router = Object.fromEntries(['post', 'patch'].map(method => [method, (path, ...args) => { handlers[path] = args.at(-1); }]));
    vm.runInNewContext(source.slice(source.indexOf('async function canManageChatDraft'), source.indexOf('// ── 分佣中心')), {
      router, User, ServiceRecord: Record, staffAuth: () => {}, checkPermission: () => () => {},
      require: name => require('../../src/routes/' + name),
    });
    const run = async (path, staff, body) => {
      const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
      await handlers[path]({ staff, params: { id: String(patientId) }, body }, res); return res;
    };
    const owner = { _id: staffId, role: 'nutritionist', tenantId };
    for (const actor of [{ ...owner, role: 'healthManager' }, { ...owner, _id: new mongoose.Types.ObjectId() }, { ...owner, role: 'superadmin', tenantId: new mongoose.Types.ObjectId() }]) {
      assert.equal((await run('/patients/:id/chat-followup/ai-draft', actor, { role: 'nutritionist' })).code, 403);
    }
    assert.equal(calls, 0);
    await Job.create({ _id: `${patientId}_nutritionist`, patientId, status: 'failed', token: 'current' });
    const path = '/patients/:id/chat-followup/resolve';
    assert.equal((await run(path, owner, { token: 'current', note: ' ' })).code, 400);
    assert.equal((await run(path, owner, { token: 'stale', note: '已实际核对' })).code, 409);
    assert.equal((await run(path, owner, { token: 'current', note: '已实际核对' })).code, 200);
    assert.equal((await Job.findOne()).handlingNote, '已实际核对');
    assert.equal((await run(path, owner, { token: 'current', note: '重复' })).code, 409);
    assert.equal(await Record.countDocuments(), 0);
    const block = source.slice(source.indexOf('    // Exceptions share'), source.indexOf('    // ── 健康规划师：AI聊天转人工待办'));
    await Job.updateOne({}, { $set: { status: 'failed', error: '合成异常' } });
    for (const [role, ids, expected] of [['nutritionist', [patientId], 1], ['nutritionist', [], 0], ['healthManager', [patientId], 0], ['superadmin', null, 1]]) {
      const todos = [];
      await vm.runInNewContext('(async()=>{' + block + '})()', { User, req: { staff: { tenantId } }, role, isSuper: role === 'superadmin', myPatientIds: ids, todos, now: new Date(), DAY: 86400000, require: () => Job });
      assert.equal(todos.length, expected);
      if (expected) { assert.equal(todos[0].canResolve, true); assert.equal(todos[0].jobToken, 'current'); }
    }
  });

  await t.test('unassigned reviewer creates an exception without AI; deleted member is skipped', async () => {
    await reset(); const patientId = await seed(), deleted = await seed();
    await User.updateOne({ _id: patientId }, { $set: { assignedNutritionist: null } });
    await User.updateOne({ _id: deleted }, { $set: { isDeleted: true } });
    const start = new Date(Date.now() - 86400000);
    await Schedule.create({ _id: 'nutrition-chat-v1', activatedAt: start, cycleStart: start, nextRunAt: start });
    await scan(); assert.equal(calls, 0); assert.equal(await Job.countDocuments(), 1);
    assert.equal((await Job.findOne()).status, 'failed'); assert.match((await Job.findOne()).error, /营养师/);
  });
  await t.test('stale retry cannot reopen an already handled failure', async () => {
    await reset(); const patientId = await seed();
    await Job.create({ _id: `${patientId}_nutritionist`, patientId, token: 'old', status: 'done', handlingNote: '已处理' });
    assert.equal((await generate({ patientId, role: 'nutritionist', expectedJobToken: 'old' })).status, 'skip');
    assert.equal(calls, 0);
  });
  await t.test('initial cutoff excludes historical messages and provider-invalid calendar dates become null', async () => {
    await reset(); const patientId = await seed();
    await Message.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 3 * 86400000) } });
    const start = new Date(Date.now() - 86400000);
    await Schedule.create({ _id: 'nutrition-chat-v1', activatedAt: start, cycleStart: start, nextRunAt: start });
    await scan(); assert.equal(calls, 0);
    respond = async () => '{"content":"合成日期测试","nextDate":"2026-02-31"}';
    const result = await generate({ patientId, role: 'nutritionist', range: 'week' });
    assert.equal(result.status, 'created'); assert.equal(result.record.nextDate, null);
  });

});
