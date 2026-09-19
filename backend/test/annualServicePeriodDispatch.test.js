const test = require('node:test');
const assert = require('node:assert/strict');
const Period = require('../src/models/AnnualServicePeriod');
const { syncAnnualPlanTaskSplit } = require('../src/utils/annualPlanTaskSplit');
const { syncAnnualPlanFollowUps } = require('../src/utils/annualPlanFollowUps');
const { syncAnnualPlanServiceTasks } = require('../src/utils/annualPlanServiceTasks');
const { syncAnnualPlanSupplyPlans } = require('../src/utils/annualPlanSupplyPlans');
const { syncAnnualPlanTreatments } = require('../src/utils/annualPlanTreatmentSync');
test('未核验续约凭据，全部年度任务写入入口都阻断', async t => {
  t.mock.method(Period, 'findOne', () => ({ lean: async () => null }));
  const plan = { _id: 'plan', patientId: 'patient', continuitySource: { previousPlanId: 'old' }, confirmedAt: new Date(), pushedAt: new Date(), reviewStatus: 'approved' };
  // 未连接数据库，若越过门槛进行任何后续查询/写入则测试会失败。
  assert.equal((await syncAnnualPlanTaskSplit(plan)).clientTasks, 0);
  assert.equal(await syncAnnualPlanFollowUps(plan), 0);
  assert.equal((await syncAnnualPlanServiceTasks(plan)).created, 0);
  assert.equal((await syncAnnualPlanSupplyPlans(plan)).created, 0);
  assert.equal((await syncAnnualPlanTreatments(plan)).skipped, true);
});
