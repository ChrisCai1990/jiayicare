const test = require('node:test');
const assert = require('node:assert/strict');
const { reply, canReply, identity } = require('../src/utils/serviceGroupAssistant');
const now = new Date();
const trigger = { id: 'message-a', createdAt: now };
const base = { _id: 'group-a', tenantId: 'tenant-a', patientId: 'patient-a', status: 'active', memberIds: ['staff-a'], membershipVersion: 1, lastCustomerMessageAt: now };
function harness(change) {
  let group = { ...base }; const saved = []; let generated = 0;
  const query = value => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => value });
  const deps = {
    Group: { findById: () => query(group), updateOne: async () => ({}) },
    Message: { exists: async () => false, find: () => query([{ ...trigger, senderType: 'customer', content: '你好' }]), findOne: () => query({ _id: trigger.id }), create: async row => saved.push(row) },
    User: { findOne: () => query({ _id: 'patient-a', assignedHealthManager: 'staff-a' }), exists: async () => true },
    Admin: { exists: async () => true },
    consent: { assertPermission: async () => {}, withPersonalData: (id, purpose, fn) => fn() },
    generate: async () => { generated++; if (change) group = change(group); return { content: '您好，很高兴为您服务。' }; },
    chat: async () => {},
  };
  return { deps, saved, calls: () => generated };
}
test('人工接待、已人工回复、群关闭时AI静默；接待过期允许新客户消息', () => {
  assert.equal(canReply({ ...base, humanActiveUntil: new Date(+now + 90000) }, trigger, now), false);
  assert.equal(canReply({ ...base, lastStaffMessageAt: now }, trigger, now), false);
  assert.equal(canReply({ ...base, status: 'closed' }, trigger, now), false);
  assert.equal(canReply({ ...base, memberIds: [] }, trigger, now), false);
  assert.equal(canReply({ ...base, humanActiveUntil: new Date(+now - 1) }, trigger, now), true);
});
test('AI采用固定小嘉身份且首条介绍准确', async () => {
  const h = harness(); await reply(base._id, trigger, h.deps);
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].senderType, 'ai');
  assert.equal(h.saved[0].senderName, '小嘉');
  assert.ok(h.saved[0].content.startsWith(identity.introduction));
  assert.equal(h.saved[0].replyTo, trigger.id);
});
test('生成期间人工接手或成员名单变化，丢弃AI回答', async () => {
  for (const change of [g => ({ ...g, humanActiveUntil: new Date(Date.now() + 90000) }), g => ({ ...g, membershipVersion: 2 })]) {
    const h = harness(change); await reply(base._id, trigger, h.deps); assert.equal(h.saved.length, 0);
  }
});
test('无授权不调用模型，授权撤回不发布已生成内容', async () => {
  for (const deniedAt of [1, 2]) {
    const h = harness(); let checks = 0;
    h.deps.consent.assertPermission = async () => { if (++checks === deniedAt) throw Object.assign(new Error(), { code: 'AI_DATA_CONSENT_REQUIRED' }); };
    await reply(base._id, trigger, h.deps);
    assert.equal(h.saved.length, 0); assert.equal(h.calls(), deniedAt - 1);
  }
});
test('客户连续发言时旧回答不发布，客户注销后不发布', async () => {
  for (const mode of ['new-message', 'deleted']) {
    const h = harness();
    if (mode === 'new-message') h.deps.Message.findOne = () => ({ sort() { return this; }, select() { return this; }, lean: async () => ({ _id: 'message-b' }) });
    else h.deps.User.exists = async () => false;
    await reply(base._id, trigger, h.deps); assert.equal(h.saved.length, 0);
  }
});

test('纯招呼不调用模型且仅首次介绍；保留授权检查', async () => {
  const h = harness();
  await reply(base._id, { ...trigger, content: '你好' }, h.deps);
  assert.equal(h.calls(), 0);
  assert.equal(h.saved[0].content, identity.introduction + '\n\n有什么需要帮忙的，请告诉我。');
  const later = harness();
  later.deps.Message.exists = async filter => filter.senderType === 'ai';
  await reply(base._id, { ...trigger, content: '在吗？' }, later.deps);
  assert.equal(later.calls(), 0);
  assert.equal(later.saved[0].content, '您好，我在。有什么需要帮忙的，请告诉我。');
});
