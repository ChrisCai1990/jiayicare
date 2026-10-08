const test = require('node:test');
const assert = require('node:assert/strict');
const { handoffsForTasks, handoffForTask } = require('../src/utils/annualManagedVisitHandoff');
const dispatch = require('../../shared/annualDispatch.cjs');

const task = { patientId: 'patient-1', sourceType: 'health_plan', sourceHealthPlanId: 'plan-1', taskRole: 'executor', theme: '门诊一站式：检查及专家门诊陪诊与归档' };
const items = [{ moduleKey: 'medical_treatment', recordIndex: 0, title: '心血管评估' }, { moduleKey: 'medical_treatment', recordIndex: 1, title: '消化内科复诊' }];
const query = rows => ({ select: () => ({ lean: async () => rows }) });

test('一站式就医专员从明确关联的年度需求看到全部同次事项', async () => {
  const map = await handoffsForTasks([task], {
    Link: { find: () => query([{ patientId: 'patient-1', targetType: 'health_plan', targetId: 'plan-1', requestTaskId: 'request-1' }]) },
    FollowUp: { find: () => query([{ _id: 'request-1', patientId: 'patient-1', formData: { serviceRequest: { mode: 'managed', itemSnapshot: { visitItems: items } } } }]) },
  });
  assert.deepEqual(handoffForTask(task, map), items);
  assert.deepEqual(handoffForTask({ ...task, patientId: 'patient-2' }, map), []);
});

test('未关联或非一站式代诊陪诊任务不投影年度事项', async () => {
  const map = await handoffsForTasks([{ ...task, theme: '其他任务' }], {
    Link: { find: () => { throw new Error('不应查询关联'); } },
  });
  assert.deepEqual(handoffForTask(task, map), []);
});

test('一站式年度需求进入服务方案关联入口，单项服务继续进入直接派单', () => {
  const request = { sourceType: 'annual_service', workflowKey: 'service_request', formData: { serviceRequest: { moduleKey: 'medical_treatment', mode: 'managed' } } };
  assert.equal(dispatch.dedicated(request), false);
  assert.equal(dispatch.dedicated({ ...request, formData: { serviceRequest: { ...request.formData.serviceRequest, mode: 'single' } } }), true);
});
