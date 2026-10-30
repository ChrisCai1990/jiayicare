const test = require('node:test');
const assert = require('node:assert/strict');
const { isStaffOnlyFollowUp } = require('../src/utils/staffOnlyFollowUp');

test('日常跟进模板及显式内部任务不进入客户待办', () => {
  assert.equal(isStaffOnlyFollowUp({ theme: '普通随访', clientVisible: false }), true);
  assert.equal(isStaffOnlyFollowUp({ theme: '【日常跟进】' }), true);
  assert.equal(isStaffOnlyFollowUp({ theme: '客户专属计划', followUpSchemeId: { name: '【日常跟进】' } }), true);
  assert.equal(isStaffOnlyFollowUp({ theme: '标准随访 · 【日常跟进】', checkInItems: ['sleep'] }), true);
  assert.equal(isStaffOnlyFollowUp({ theme: '【日常跟进】', checkInItems: ['diet', 'exercise'] }), true);
  assert.equal(isStaffOnlyFollowUp({ theme: '客户可见随访', checkInItems: ['bloodPressure'], repeatWeekly: true }), false);
});
