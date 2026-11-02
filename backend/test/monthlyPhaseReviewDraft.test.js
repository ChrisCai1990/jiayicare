const test = require('node:test');
const assert = require('node:assert/strict');
const HealthRecord = require('../src/models/HealthRecord');
const FollowUp = require('../src/models/FollowUp');
const MedicalReport = require('../src/models/MedicalReport');
const ServiceRecord = require('../src/models/ServiceRecord');
const { buildMonthlyPhaseReviewDraft } = require('../src/utils/monthlyPhaseReviewDraft');

const query = rows => ({ sort: () => ({ limit: () => ({ select: () => ({ lean: async () => rows }) }) }) });

test('月度人工复盘列出普通检查和就医记录，不作高频原因推断', async t => {
  t.mock.method(HealthRecord, 'find', () => query([{ type: 'weight', label: '体重', recordedAt: new Date('2026-10-10') }]));
  t.mock.method(FollowUp, 'find', () => query([]));
  t.mock.method(ServiceRecord, 'find', () => query([
    { date: new Date('2026-10-05'), title: '门诊复查', medicalEscort: { hospital: '甲医院', department: '内科' } },
    { date: new Date('2026-10-20'), title: '门诊就医', medicalEscort: { hospital: '乙医院', department: '外科' } },
  ]));
  t.mock.method(MedicalReport, 'find', () => query([{ checkDate: '2026-10-20', title: '复查报告', reportItems: [{ name: '检查甲', value: '5.1', unit: '单位', status: 'normal' }, { name: '检查乙', value: '6.2', unit: '单位', status: 'abnormal' }] }]));
  const draft = await buildMonthlyPhaseReviewDraft({ _id: 'synthetic' }, { start: new Date('2026-09-30T16:00:00Z'), end: new Date('2026-10-31T15:59:59Z') });
  assert.match(draft.content, /就医服务记录：2条，覆盖2个日期/);
  assert.match(draft.content, /检查甲 5.1 单位、检查乙 6.2 单位/);
  assert.match(draft.content, /核实是否计划内复查/);
  assert.doesNotMatch(draft.content, /就医频繁的原因是/);
});
