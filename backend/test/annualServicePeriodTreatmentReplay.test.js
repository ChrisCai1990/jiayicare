const test = require('node:test');
const assert = require('node:assert/strict');
const gate = require('../src/utils/annualServicePeriod');
const Medication = require('../src/models/Medication');
const Supplement = require('../src/models/Supplement');
const Supply = require('../src/models/RecurringSupplyPlan');
const { syncAnnualPlanTreatments } = require('../src/utils/annualPlanTreatmentSync');
const { syncAnnualPlanSupplyPlans } = require('../src/utils/annualPlanSupplyPlans');
const plan = { _id: 'plan', continuitySource: { previousPlanId: 'old' }, moduleData: {
  medication: { records: [{ recordKey: 'med', name: '既有药物档案', itemName: '既有药物档案', dosage: '原档案记录', frequency: '每月一次' }] },
  supplement: { records: [{ recordKey: 'sup', name: '既有营养素档案', itemName: '既有营养素档案', dosage: '原档案记录', frequency: '每月一次' }] },
} };
test('续年启用重试不恢复人工停用的药物/营养素，不覆盖人工用量调整', async t => {
  t.mock.method(gate, 'annualExecutionGate', async () => ({ allowed: true }));
  for (const Model of [Medication, Supplement]) {
    t.mock.method(Model, 'findOne', filter => {
      assert.equal(filter.stopped, undefined);
      return { sort: async () => ({ stopped: true, dosage: '人工已调整', save: async () => assert.fail('不能覆盖既有档案') }) };
    });
    t.mock.method(Model, 'find', async () => []);
    t.mock.method(Model, 'create', async () => assert.fail('不得重新创建停用项目'));
  }
  const result = await syncAnnualPlanTreatments(plan);
  assert.equal(result.medication.created, 0); assert.equal(result.supplement.updated, 0);
});
test('续年重试不重启人工暂停的周期补给，也不重设下次日期', async t => {
  t.mock.method(gate, 'annualExecutionGate', async () => ({ allowed: true }));
  t.mock.method(Supply, 'find', async q => [{ itemName: q.planType === 'medication' ? '既有药物档案' : '既有营养素档案', enabled: false, nextDueDate: new Date('2027-03-01'), save: async () => assert.fail('不能重启或改期') }]);
  t.mock.method(Supply, 'create', async () => assert.fail('不能重复创建'));
  assert.deepEqual(await syncAnnualPlanSupplyPlans(plan), { created: 0, updated: 0, disabled: 0 });
});
