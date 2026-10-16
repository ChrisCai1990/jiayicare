const test = require('node:test');
const assert = require('node:assert/strict');
const FollowUp = require('../src/models/FollowUp');
const { nextWeeklyDate, weeklySuccessorId, generateNextWeeklyFollowUp } = require('../src/utils/rollingWeeklyFollowUp');

test('每周随访从完成当天起七天后安排，不补生成积压周次', () => {
  assert.equal(nextWeeklyDate('2026-10-16T17:00:00.000Z').toISOString(), '2026-10-24T00:00:00.000Z');
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
    assert.equal(options.upsert, true);
    assert.equal(await generateNextWeeklyFollowUp({ ...task, status: 'cancelled' }), null);
    assert.equal(calls.length, 1);
  } finally {
    FollowUp.findOneAndUpdate = original;
  }
});
