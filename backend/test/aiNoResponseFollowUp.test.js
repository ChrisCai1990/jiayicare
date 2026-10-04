const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuntime, handoffId } = require('../src/utils/aiNoResponseFollowUp');
const { buildAnnualPlanFollowUps } = require('../src/utils/annualPlanFollowUps');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');

function fixture() {
  const task = { _id: '000000000000000000000011', patientId: '000000000000000000000022',
    sourceAnnualPlanId: '000000000000000000000033', sourceType: 'scheduled',
    sourceScheduleKey: 'personalized:plan:0:2026-10-04', status: 'planned', aiStatus: 'approved',
    theme: '标准随访', aiNoResponse: { state: 'pending', attemptCount: 0, nextAt: new Date('2026-10-04T00:00:00Z') } };
  const sent = new Map(); const handoffs = new Map(); let replied = false; let chatReplied = false;
  const apply = patch => Object.entries(patch).forEach(([key, value]) => {
    const fields = key.split('.'); let target = task;
    while (fields.length > 1) target = target[fields.shift()];
    target[fields[0]] = value;
  });
  const FollowUp = {
    async updateOne(filter, update) {
      if (filter['aiNoResponse.attemptCount'] !== undefined && filter['aiNoResponse.attemptCount'] !== task.aiNoResponse.attemptCount) return { modifiedCount: 0 };
      apply(update.$set); return { modifiedCount: 1 };
    },
    async findOneAndUpdate(filter, update) { if (!handoffs.has(String(filter._id))) handoffs.set(String(filter._id), update.$setOnInsert); return handoffs.get(String(filter._id)); },
  };
  const Message = {
    async exists() { return replied; },
    async findOneAndUpdate(filter) { if (!sent.has(filter.dedupeKey)) sent.set(filter.dedupeKey, { createdAt: new Date('2026-10-04T00:00:00Z') }); return sent.get(filter.dedupeKey); },
  };
  const runtime = createRuntime({ FollowUp, Message, ChatLog: { async exists() { return chatReplied; } },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: '000000000000000000000044' }) }) }) },
    AnnualPlan: { findById: () => ({ lean: async () => ({ confirmedAt: new Date(), servicePackageSnapshot: { noResponseRule: '连续3次（隔日）未配合转人工' } }) }) },
    annualExecutionGate: async () => ({ allowed: true }), enabledForPatient: () => true });
  return { task, sent, handoffs, runtime, reply: () => { replied = true; }, chatReply: () => { chatReplied = true; } };
}

test('three attempts are separated by 48 hours; handoff occurs after the final response window', async () => {
  const f = fixture(); const start = Date.parse('2026-10-04T00:00:00Z');
  assert.equal(await f.runtime.process(f.task, new Date(start)), 'sent');
  assert.equal(await f.runtime.process(f.task, new Date(start + 24 * 3600000)), 'skipped');
  assert.equal(await f.runtime.process(f.task, new Date(start + 48 * 3600000)), 'sent');
  assert.equal(await f.runtime.process(f.task, new Date(start + 96 * 3600000)), 'sent');
  assert.equal(f.handoffs.size, 0);
  assert.equal(await f.runtime.process(f.task, new Date(start + 144 * 3600000)), 'escalated');
  assert.equal(f.handoffs.size, 1);
  assert.equal(String([...f.handoffs.keys()][0]), String(handoffId(f.task._id)));
  assert.equal([...f.handoffs.values()][0].assignedTo, '000000000000000000000044');
  assert.equal(await f.runtime.process(f.task, new Date(start + 192 * 3600000)), 'skipped');
  assert.equal(f.sent.size, 3);
});

test('a customer reply stops reminders and prevents a handoff', async () => {
  const f = fixture(); const start = Date.parse('2026-10-04T00:00:00Z');
  await f.runtime.process(f.task, new Date(start)); f.reply();
  assert.equal(await f.runtime.process(f.task, new Date(start + 48 * 3600000)), 'responded');
  assert.equal(f.task.aiNoResponse.state, 'responded');
  assert.equal(f.sent.size, 1); assert.equal(f.handoffs.size, 0);
});

test('a reply to the AI chat also stops the follow-up sequence', async () => {
  const f = fixture(); const start = Date.parse('2026-10-04T00:00:00Z');
  await f.runtime.process(f.task, new Date(start)); f.chatReply();
  assert.equal(await f.runtime.process(f.task, new Date(start + 48 * 3600000)), 'responded');
  assert.equal(f.handoffs.size, 0);
});

test('unmarked legacy task and closed task never enter the new workflow', async () => {
  const f = fixture();
  const legacy = { ...f.task, aiNoResponse: null };
  assert.equal(await f.runtime.process(legacy, new Date()), 'skipped');
  f.task.status = 'completed';
  assert.equal(await f.runtime.process(f.task, new Date()), 'skipped');
  assert.equal(f.sent.size, 0); assert.equal(f.handoffs.size, 0);
});

test('scanner stays disabled unless explicitly enabled', async () => {
  const f = fixture();
  assert.deepEqual(await f.runtime.scan(new Date(), {}), { disabled: true, sent: 0, escalated: 0 });
  assert.equal(f.sent.size, 0);
});

test('only future personalized schedules with the exact frozen package rule receive the marker', async t => {
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: '000000000000000000000044', assignedNutritionist: '000000000000000000000055' }) }) }));
  t.mock.method(Admin, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const plan = { _id: '000000000000000000000033', patientId: '000000000000000000000022', createdBy: '000000000000000000000044', confirmedAt: new Date(),
    servicePackageSnapshot: { noResponseRule: '连续3次（隔日）未配合转人工' },
    moduleData: { personalized_followups: { records: [
      { standardPlanId: 'plan', standardPlanName: '标准随访', executionDate: date },
      { standardPlanId: 'nutrition', standardPlanName: '营养评估', executionDate: date, directNutritionAssessment: true },
    ] } } };
  const previous = process.env.AI_NO_RESPONSE_FOLLOWUP_ENABLED;
  try {
    delete process.env.AI_NO_RESPONSE_FOLLOWUP_ENABLED;
    assert.equal((await buildAnnualPlanFollowUps(plan))[0].aiNoResponse, undefined);
    process.env.AI_NO_RESPONSE_FOLLOWUP_ENABLED = 'true';
    const enabledRows = await buildAnnualPlanFollowUps(plan);
    assert.equal(enabledRows[0].aiNoResponse.state, 'pending');
    assert.equal(enabledRows[1].aiNoResponse, undefined);
    plan.servicePackageSnapshot.noResponseRule = '其他规则';
    assert.equal((await buildAnnualPlanFollowUps(plan))[0].aiNoResponse, undefined);
  } finally {
    if (previous === undefined) delete process.env.AI_NO_RESPONSE_FOLLOWUP_ENABLED;
    else process.env.AI_NO_RESPONSE_FOLLOWUP_ENABLED = previous;
  }
});
