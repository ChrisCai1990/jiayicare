const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('fixed chain repair never creates conditional, customer or unknown-stage tasks', async () => {
  const schemes = [
    { _id: 'fixed', workflowStageKey: 'booking', executorRole: 'healthPlanner' },
    { _id: 'conditional', workflowStageKey: 'result_review', executorRole: 'familyDoctor' },
    { _id: 'abnormal', workflowStageKey: 'abnormal_followup', executorRole: 'familyDoctor' },
    { _id: 'customer', workflowStageKey: 'customer_intake', executorRole: 'familyDoctor' },
    { _id: 'unknown', workflowStageKey: 'future_stage', executorRole: 'familyDoctor' },
  ];
  for (const metadataField of ['followUpPlans', 'workflowModules']) {
    const created = [];
    const service = { _id: 'service', type: 'medical_assist', content: {
      serviceDomain: 'annual_checkup', followUpPlans: schemes.map(s => ({ id: s._id })),
    } };
    service.content[metadataField] = schemes.map(s => ({ id: s._id, mode: s._id === 'conditional' ? 'conditional' : 'fixed' }));
    const models = {
      FollowUp: { findOneAndUpdate: async filter => { created.push(filter.workflowKey); return { _id: filter.workflowKey }; } },
      FollowUpPlan: { find: () => ({ lean: async () => schemes }) }, HealthPlan: {}, Order: {},
      User: { findById: () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner', assignedFamilyDoctor: 'advisor' }) }) }) },
    };
    const sandbox = { module: { exports: {} }, require: name => models[path.basename(name)], console };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/checkupOneStopFlow.js'), 'utf8'), sandbox);
    await sandbox.module.exports.ensureCheckupTasks(service);
    assert.deepEqual(created, ['fixed']);
  }
});

for (const stage of ['booking', 'onsite']) {
  for (const status of ['planned', 'in_progress', 'completed', 'cancelled']) {
    test(`${stage} replay preserves ${status} downstream task`, async () => {
      const targetStage = stage === 'booking' ? 'onsite' : 'report_collection';
      const target = { _id: 'target', status, isBlocked: status === 'planned', dependsOnTaskId: 'source', serviceChecklist: [{ executionResult: 'existing evidence' }] };
      const schemes = [{ _id: 'source', workflowStageKey: stage, executorRole: 'healthPlanner' }, { _id: 'target', workflowStageKey: targetStage, executorRole: 'healthManager' }];
      const source = { _id: 'source', status: 'completed' };
      const FollowUp = {
        findOneAndUpdate: async filter => filter.workflowKey === 'target' ? target : source,
        updateOne: async (filter, update) => {
          if (filter._id !== target._id) return;
          if (filter.isBlocked !== undefined && filter.isBlocked !== target.isBlocked) return;
          if (filter.status && !filter.status.$in.includes(target.status)) return;
          Object.assign(target, update.$set);
        },
      };
      const service = { _id: 'service', type: 'medical_assist', content: { serviceDomain: 'annual_checkup', followUpPlans: schemes.map(s => ({ id: s._id })) } };
      const models = { FollowUp, FollowUpPlan: { find: () => ({ lean: async () => schemes }), findById: () => ({ lean: async () => schemes[0] }) },
        HealthPlan: { findById: async () => service }, Order: {}, User: { findById: () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner', assignedHealthManager: 'manager' }) }) }) } };
      const sandbox = { module: { exports: {} }, require: name => models[path.basename(name)], console };
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/checkupOneStopFlow.js'), 'utf8'), sandbox);
      const input = { status: 'completed', sourceHealthPlanId: 'service', followUpSchemeId: 'source', serviceChecklist: [], executedContent: 'booking evidence' };
      await sandbox.module.exports.advanceCheckupTask(input);
      assert.equal(target.status, status);
      assert.equal(target.isBlocked, false);
      const afterFirst = JSON.stringify(target);
      await sandbox.module.exports.advanceCheckupTask(input);
      assert.equal(JSON.stringify(target), afterFirst);
      if (status !== 'planned') assert.equal(target.serviceChecklist[0].executionResult, 'existing evidence');
    });
  }
}
