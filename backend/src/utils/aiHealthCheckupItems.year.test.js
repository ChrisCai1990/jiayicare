const test = require('node:test');
const assert = require('node:assert/strict');
const { approvedDoctorSections, approvedItems } = require('./aiHealthCheckupItems');

test('年度方案只读取目标年已审核的 AI 健康信息', () => {
  const summary = { byYear: {
    2025: { records: [{ scope: 'doctor', doctorApprovedAt: '2025-11-01', sections: { checkup_completeness: { missing: ['旧年项目'] } } }] },
    2026: { records: [{ scope: 'doctor', doctorApprovedAt: '2026-11-01', sections: {
      checkup_completeness: { missing: ['当年待完善项目'] }, cardiovascular_risk: { high: ['下一年度关注项'] },
    } }] },
  } };
  assert.deepEqual(approvedDoctorSections(summary, 2026).checkup_completeness.missing, ['当年待完善项目']);
  assert.deepEqual(approvedItems(summary, 2026).items.map(row => row.text), ['当年待完善项目']);
  assert.deepEqual(approvedDoctorSections(summary, 2027), {});
});
