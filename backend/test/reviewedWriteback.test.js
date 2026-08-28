const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewedWriteback } = require('../src/utils/reviewedWriteback');

test('人工确认后生成完整自动回写审计信息', () => {
  const at = new Date('2026-08-28T08:00:00.000Z');
  const value = reviewedWriteback({
    staff: { _id: 'staff-1', name: '审核人员', role: 'nutritionist' },
    sourceType: 'ai_draft',
    at,
  });
  assert.deepEqual(value, {
    sourceType: 'ai_draft', sourceTaskId: null, status: 'written', reviewedBy: 'staff-1',
    reviewedByName: '审核人员', reviewedByRole: 'nutritionist', reviewedAt: at, writtenAt: at,
  });
});

test('没有人工审核人时禁止自动回写', () => {
  assert.throws(() => reviewedWriteback({ staff: null }), /必须记录人工审核人/);
});
