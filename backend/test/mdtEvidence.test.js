const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMdtEvidence } = require('../src/utils/mdtEvidence');

test('reads current disease records and keeps source/date on extracted facts', () => {
  const patient = { medicalRecord: { courseEntries: [{ content: '旧版重复病程' }] }, diseaseRecords: [{
    name: '示例专病', summary: { chiefComplaint: '反复不适', initialOccurredAt: '2026-09-01' },
    courseEntries: [{ occurredAt: '2026-10-01', content: '症状持续', diagnosis: '门诊记录诊断', sourceInstitution: '示例医院' },
      { occurredAt: '2026-10-02', content: '已撤销', cancelledAt: '2026-10-03' }],
  }] };
  const reports = [{ title: '示例检查', date: '2026-10-01', findings: ['项目：数值'] }];
  const medications = [{ name: '示例药物', dosage: '1片', frequency: '每日', stopped: true, stopReason: '原记录停用', startDate: '2026-09-10' },
    { name: '待审核药物', aiStatus: 'pending' }];
  const result = buildMdtEvidence(patient, reports, medications);
  assert.equal(result.tables.timelineRows.length, 2);
  assert.equal(result.tables.timelineRows[1].assessment, '门诊记录诊断');
  assert.match(result.tables.timelineRows[1].source, /示例医院/);
  assert.equal(result.tables.timelineRows.some(row => row.event.includes('旧版重复')), false);
  assert.equal(result.tables.treatmentRows.length, 1);
  assert.equal(result.tables.treatmentRows[0].currentStatus, '已停用');
  assert.match(result.tables.testRows[0].originalResult, /报告快照摘录/);
  assert.equal(result.tables.testRows[0].interpretation, '');
  assert.equal(result.tables.testRows[0].verification, '待核实');
});

test('falls back to legacy record only when current disease records are absent', () => {
  const result = buildMdtEvidence({ diseaseRecords: [], medicalRecord: {
    summary: { chiefComplaint: '旧版主诉' }, courseEntries: [{ occurredAt: '2026-01-02', content: '旧版病程' }],
  } });
  assert.equal(result.tables.timelineRows.length, 2);
  assert.match(result.tables.timelineRows[1].source, /旧版病历/);
  assert.equal(result.tables.timelineRows[1].verification, '待核实');
});
