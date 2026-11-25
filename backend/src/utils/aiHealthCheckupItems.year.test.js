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

test('已审核肿瘤筛查待补项进入顾问核对，未审核板块不带入', () => {
  const summary = { byYear: { 2026: { records: [{ scope: 'doctor', sections: {
    tumor_risk: { missing: ['肠镜和胃镜待完善'] }, checkup_completeness: { missing: ['尿微量白蛋白复查'] },
  }, sectionReviews: {
    tumor_risk: { status: 'approved', approvedAt: '2026-11-24' },
    checkup_completeness: { status: 'pending' },
  } }] } } };
  assert.deepEqual(approvedItems(summary, 2026).items.map(row => row.text), ['肠镜和胃镜待完善']);
  summary.byYear[2026].records[0].sectionReviews.checkup_completeness = { status: 'approved', approvedAt: '2026-11-24' };
  assert.deepEqual(approvedItems(summary, 2026).items.map(row => row.text), ['尿微量白蛋白复查', '肠镜和胃镜待完善']);
});

test('肿瘤总评明确优先补做检查时也供顾问核对', () => {
  const summary = { byYear: { 2026: { records: [{ scope: 'doctor', sections: {
    tumor_risk: { missing: [], summary: '结直肠癌、胃癌筛查存在关键缺口，其中肠镜和胃镜为优先补做项目。' },
    checkup_completeness: { missing: [] },
  }, sectionReviews: { tumor_risk: { status: 'approved', approvedAt: '2026-11-24' } } }] } } };
  assert.deepEqual(approvedItems(summary, 2026).items.map(row => row.text), ['结直肠癌、胃癌筛查存在关键缺口，其中肠镜和胃镜为优先补做项目']);
  summary.byYear[2026].records[0].sections.tumor_risk.summary = '乳腺钼靶为优先补做项目。';
  assert.deepEqual(approvedItems(summary, 2026).items.map(row => row.text), ['乳腺钼靶为优先补做项目']);
});

test('目标年度已审核胸部 CT 与碳13呼气试验不会再次变成待补检查', () => {
  const summary = { sections: { checkup_completeness: { missing: ['低剂量胸部CT（LDCT）', '幽门螺杆菌年度复查', '结肠镜'] } }, approvedAt: '2026-11-24' };
  const reports = [
    { audit_status: 'audited', checkDate: '2026-10-23', reportItems: [{ name: '胸部CT平扫' }] },
    { audit_status: 'audited', checkDate: '2026-10-23', reportItems: [{ name: '碳-13呼气', value: '阴性' }] },
  ];
  assert.deepEqual(approvedItems(summary, 2026, reports).items.map(item => item.title), ['结肠镜']);
  assert.equal(approvedItems(summary, 2027, reports).items.length, 3);
  assert.equal(approvedItems(summary, 2026, reports.map(report => ({ ...report, audit_status: 'pending' }))).items.length, 3);
});
