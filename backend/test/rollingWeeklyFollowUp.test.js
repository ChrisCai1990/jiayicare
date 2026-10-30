const test = require('node:test');
const assert = require('node:assert/strict');
const FollowUp = require('../src/models/FollowUp');
const { nextWeeklyDate, weeklySuccessorId, generateNextWeeklyFollowUp, completeWeeklyCheckIn } = require('../src/utils/rollingWeeklyFollowUp');

test('每周随访从完成当天起七天后安排，不补生成积压周次', () => {
  assert.equal(nextWeeklyDate('2026-10-16T17:00:00.000Z').toISOString(), '2026-10-24T00:00:00.000Z');
});

test('周一应测、周三补测时，血压从周三顺延七天', async t => {
  const measuredAt = new Date('2026-10-28T02:00:00Z');
  const task = { _id: 'current', patientId: 'patient', repeatWeekly: true, status: 'planned',
    checkInItems: ['bloodPressure'], weeklyTemplate: { theme: '血压', checkInItems: ['bloodPressure'] } };
  const writes = [];
  t.mock.method(FollowUp, 'findOne', () => ({ sort: async () => task }));
  t.mock.method(FollowUp, 'findOneAndUpdate', async (filter, update) => {
    writes.push({ filter, update });
    return String(filter._id) === 'current' ? { ...task, status: 'completed', completedAt: measuredAt } : { _id: filter._id };
  });
  await completeWeeklyCheckIn('patient', 'bloodPressure', measuredAt);
  assert.equal(writes[0].filter.date, undefined);
  assert.equal(writes[0].update.$set.completedAt.toISOString(), measuredAt.toISOString());
  assert.equal(writes[1].update.$setOnInsert.date.toISOString(), '2026-11-04T00:00:00.000Z');
});

test('旧合并任务只推进已测血压，未测体重保留在原任务', async t => {
  const task = { _id: 'combined', patientId: 'patient', repeatWeekly: true, status: 'planned',
    checkInItems: ['bloodPressure', 'weight'], weeklyTemplate: { theme: '血压和体重', checkInItems: ['bloodPressure', 'weight'] },
    toObject() { return { ...this }; } };
  const writes = [];
  t.mock.method(FollowUp, 'findOne', () => ({ sort: async () => task }));
  t.mock.method(FollowUp, 'findOneAndUpdate', async (filter, update) => {
    writes.push({ filter, update });
    return String(filter._id) === 'combined' ? { ...task, checkInItems: ['weight'] } : { _id: filter._id };
  });
  await completeWeeklyCheckIn('patient', 'bloodPressure', new Date('2026-10-28T02:00:00Z'));
  assert.equal(writes[0].update.$pull.checkInItems, 'bloodPressure');
  assert.deepEqual(writes[1].update.$setOnInsert.checkInItems, ['bloodPressure']);
  assert.equal(writes[1].update.$setOnInsert.date.toISOString(), '2026-11-04T00:00:00.000Z');
});

test('完成后只为当前记录生成一个后续计划，并保留原计划内容', async () => {
  const original = FollowUp.findOneAndUpdate;
  const calls = [];
  FollowUp.findOneAndUpdate = async (...args) => { calls.push(args); return { _id: 'next' }; };
  try {
    const task = {
      _id: 'current', repeatWeekly: true, status: 'completed', completedAt: new Date('2026-10-16T02:00:00Z'),
      patientId: 'patient', staffId: 'creator', assignedTo: 'assignee', tenantId: 'tenant',
      weeklyTemplate: { type: 'wechat', theme: '血压+体重', content: '记录血压和体重', formData: { '监测频率': '每周1次' } },
    };
    await generateNextWeeklyFollowUp(task);
    const [filter, update, options] = calls[0];
    assert.equal(String(filter._id), String(weeklySuccessorId('current')));
    assert.equal(String(update.$setOnInsert._id), String(filter._id));
    assert.equal(update.$setOnInsert.weeklyParentId, 'current');
    assert.equal(update.$setOnInsert.date.toISOString(), '2026-10-23T00:00:00.000Z');
    assert.equal(update.$setOnInsert.status, 'planned');
    assert.equal(update.$setOnInsert.content, '记录血压和体重');
    assert.equal(update.$setOnInsert.assignedTo, 'assignee');
    assert.equal(update.$setOnInsert.clientVisible, true);
    assert.equal(options.upsert, true);
    assert.equal(await generateNextWeeklyFollowUp({ ...task, status: 'cancelled' }), null);
    assert.equal(calls.length, 1);
  } finally {
    FollowUp.findOneAndUpdate = original;
  }
});

test('内部日常跟进滚动后仍只在工作人员工作台', async t => {
  const writes = [];
  t.mock.method(FollowUp, 'findOneAndUpdate', async (filter, update) => { writes.push(update); return { _id: filter._id }; });
  await generateNextWeeklyFollowUp({ _id: 'internal', repeatWeekly: true, status: 'completed',
    clientVisible: false, completedAt: new Date('2026-10-28T02:00:00Z'),
    weeklyTemplate: { type: 'phone', theme: '【日常跟进】', checkInItems: ['weight'] } });
  assert.equal(writes[0].$setOnInsert.clientVisible, false);
});
