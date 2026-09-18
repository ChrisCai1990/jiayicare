const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnnualPreparationTaskRows } = require('../src/utils/annualPlanPreparationTaskRows');

const checklist = items => ({ items });

test('只为缺失的用药或营养素档案生成内部任务', () => {
  const rows = buildAnnualPreparationTaskRows({
    patient: { _id: 'patient', assignedHealthManager: 'manager' },
    year: 2026,
    checklist: checklist([
      { key: 'medications', complete: false },
      { key: 'supplements', complete: true },
      { key: 'audited_reports', complete: false },
    ]),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].itemKey, 'medications');
  assert.equal(rows[0].assignedTo, 'manager');
});

test('没有健管专员时不生成无人负责的内部任务', () => {
  const rows = buildAnnualPreparationTaskRows({
    patient: { _id: 'patient' }, year: 2026,
    checklist: checklist([{ key: 'medications', complete: false }]),
  });
  assert.deepEqual(rows, []);
});

test('档案均完成时不增加人工任务', () => {
  const rows = buildAnnualPreparationTaskRows({
    patient: { _id: 'patient', assignedHealthManager: 'manager' }, year: 2026,
    checklist: checklist([{ key: 'medications', complete: true }, { key: 'supplements', complete: true }]),
  });
  assert.deepEqual(rows, []);
});
