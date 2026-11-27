const test = require('node:test');
const assert = require('node:assert/strict');
const { projectEvidence } = require('../src/utils/woncaEvidence');
const old = new Date('2026-10-01'),
  end = new Date('2026-11-26T15:59:59Z');
const fixture = () => ({
  user: { createdAt: old },
  year: 2026,
  end,
  catalog: [],
  reports: [],
  drafts: [],
  plans: [],
  tasks: [],
  decisions: [],
  reviews: [],
  medications: [],
});
test('两份同年方案、主诉去向和共识议题分开计数', () => {
  const x = fixture();
  x.decisions.push({
    _id: 'd1',
    createdAt: old,
    symptomRecordId: 'sym',
    direction: 'medical_treatment',
    status: 'active',
  });
  x.plans.push(
    {
      _id: 'p1',
      createdAt: old,
      moduleData: {
        medical_treatment: { records: [{ sourceIds: ['management_issue:d1'] }] },
        health_consensus: { records: [{ question: '测试议题' }] },
      },
    },
    { _id: 'p2', createdAt: old }
  );
  const r = projectEvidence(x);
  assert.equal(r.plans.length, 2);
  assert.equal(r.plans[0].consensus, 1);
  assert.equal(r.plans[1].consensus, null);
  assert.equal(r.items[0].position, '#P1 安排就医');
  assert.equal(r.items[0].source, '客户主诉');
});
test('截止日隔离未来记录，历史不可还原不计为待审核或未完成', () => {
  const x = fixture(),
    future = new Date('2026-12-01');
  x.drafts = [
    { _id: 'a', reportId: 'r', createdAt: old, updatedAt: future, status: 'approved' },
    { _id: 'b', createdAt: future },
  ];
  x.tasks = [
    {
      _id: 't',
      sourceAnnualPlanId: 'p',
      status: 'completed',
      createdAt: old,
      updatedAt: future,
      completedAt: future,
      progressRecords: [{ recordedAt: old }, { recordedAt: future }],
    },
  ];
  const r = projectEvidence(x);
  assert.equal(r.drafts.length, 1);
  assert.match(r.drafts[0].state, /历史/);
  assert.equal(r.follow.length, 1);
  assert.equal(r.follow[0].contacts, 1);
  assert.equal(r.follow[0].completedAt, null);
  assert.match(r.follow[0].state, /历史/);
});
test('历史退回与生成失败分开，药物审核与报告查看独立', () => {
  const x = fixture();
  x.reports.push({ _id: 'r', createdAt: old, documentCategory: 'prescription_order' });
  x.medications.push({ createdAt: old, sourceRecordKey: 'prescription_manual:r:med', aiStatus: 'approved' });
  x.drafts.push({
    _id: 'd',
    reportId: 'r',
    createdAt: old,
    status: 'rejected',
    followUpAutomation: { status: 'failed' },
  });
  const r = projectEvidence(x);
  assert.equal(r.docs[0].medication, '1/1');
  assert.equal(r.docs[0].viewed, null);
  assert.equal(r.drafts[0].generation, '生成失败');
  assert.match(r.drafts[0].state, /未区分/);
});
