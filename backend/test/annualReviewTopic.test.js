const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const start = route.indexOf('      const reportFollowUpFilter =');
const end = route.indexOf('\n    // 已审核病历/检查资料', start);
const block = route.slice(start, end).replace(/\n    }\s*$/, '');
const query = rows => ({ populate() { return this; }, sort() { return this; }, select() { return this; }, lean: async () => rows });

async function project(tasks, drafts) {
  const todos = [];
  const context = {
    isSuper: false, req: { staff: { _id: 'advisor' } },
    FollowUp: { find: () => query(tasks) },
    require: name => {
      assert.equal(name, '../models/ReportFollowUpDraft');
      return { find: filter => {
        assert.deepEqual(Array.from(filter._id.$in), tasks.map(task => task.sourceId).filter(Boolean));
        return query(drafts);
      } };
    },
    inMyScope: id => id === 'patient', now: new Date('2026-09-30'), DAY: 86400000, todos,
  };
  await vm.runInNewContext(`(async () => { ${block} })()`, context);
  return todos;
}

test('同一客户的年度输入合为一条待办，保留各草稿审核入口', async () => {
  const [todo] = await project([
    { _id: 'task1', sourceId: 'draft1', patientId: { _id: 'patient', name: '测试客户' }, theme: '审核报告随访 · 旧主题', createdAt: '2026-09-26' },
    { _id: 'task2', sourceId: 'draft2', patientId: { _id: 'patient', name: '测试客户' }, createdAt: '2026-09-27' },
  ], [{ _id: 'draft1', purpose: 'annual_report_input', title: '血常规' }, { _id: 'draft2', purpose: 'annual_report_input', title: '肝功能' }]);
  assert.equal(todo.type, 'annual_plan_input_review');
  assert.equal(todo.label, '年度方案待审核');
  assert.equal(todo.summary, '2 类报告问题及建议待审核 · 血常规、肝功能');
  assert.doesNotMatch(todo.summary, /派发|随访/);
  assert.equal(todo.overdue, true);
  assert.equal(todo.link, '/patients/patient/annual-health?reviewAnnualInputs=1#report-followup-drafts');
});

test('真正随访和缺失来源不冒充年度方案，保留客户范围过滤', async () => {
  const rows = await project([
    { _id: 'legacy', sourceId: 'legacy', patientId: { _id: 'patient' } },
    { _id: 'missing', patientId: { _id: 'patient' } },
    { _id: 'outside', sourceId: 'annual', patientId: { _id: 'other' } },
  ], [{ _id: 'legacy', purpose: 'issue_collaboration' }, { _id: 'annual', purpose: 'annual_report_input' }]);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.type, 'report_followup_review');
    assert.equal(row.label, '报告随访草稿待审核');
  }
});

test('年度方案审核归入方案与评估分类', () => {
  const panel = fs.readFileSync(path.join(__dirname, '../../staff/src/components/AiTodosPanel.jsx'), 'utf8');
  const groups = vm.runInNewContext(panel.match(/const TODO_GROUPS = (\[[\s\S]*?\n\])/)[1]);
  assert.ok(groups.find(group => group.key === 'plan').types.includes('annual_plan_input_review'));
  assert.ok(!groups.find(group => group.key === 'report').types.includes('annual_plan_input_review'));
});

test('年度输入与真正的报告随访分别呈现', async () => {
  const rows = await project([
    { _id: 'annual', sourceId: 'annualDraft', patientId: { _id: 'patient' } },
    { _id: 'followup', sourceId: 'followupDraft', patientId: { _id: 'patient' } },
  ], [{ _id: 'annualDraft', purpose: 'annual_report_input', title: '血常规' }, { _id: 'followupDraft', purpose: 'issue_collaboration' }]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.type).sort(), ['annual_plan_input_review', 'report_followup_review']);
  assert.equal(rows.find(row => row.type === 'report_followup_review').link, '/patients/patient/annual-health?reviewDraftId=followupDraft#report-followup-drafts');
});
