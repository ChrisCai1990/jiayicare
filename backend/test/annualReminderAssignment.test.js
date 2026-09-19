const test = require('node:test');
const assert = require('node:assert/strict');
const sift = require('sift').default;
const { annualReminderAssignmentFilter, reconcileAnnualReminderAssignments } = require('../src/utils/annualReminderAssignment');
const base = { _id: 'task', patientId: 'patient', assignedTo: 'old', status: 'planned', theme: '年度体检提醒', sourceType: 'scheduled', sourceAnnualPlanId: 'annual' };

test('普通年度就医/体检提醒可以校正，旧缺省角色字段仍兼容', () => {
  const matches = sift(annualReminderAssignmentFilter());
  assert.equal(matches(base), true);
  assert.equal(matches({ ...base, theme: '就医提醒', status: 'missed', taskRole: '', workflowKey: '' }), true);
  assert.equal(matches({ ...base, theme: '其他事项' }), false);
});

test('同名体检服务、准备任务、已开始和有关联的事项不改派', () => {
  const matches = sift(annualReminderAssignmentFilter());
  for (const patch of [
    { sourceType: 'annual_service' }, { sourceType: 'health_plan' }, { sourceType: 'order' }, { sourceType: null },
    { taskRole: 'executor' }, { taskRole: 'supervisor' }, { workflowKey: 'booking' },
    { sourceHealthPlanId: 'checkup-plan' }, { sourceOrderId: 'order' }, { sourceAnnualPlanId: null },
    { status: 'in_progress' }, { status: 'completed' }, { status: 'cancelled' },
    { serviceTracking: { linkId: 'link' } }, { isBlocked: true },
  ]) assert.equal(matches({ ...base, ...patch }), false, JSON.stringify(patch));
});

function harness(rows, beforeUpdate = () => {}, manager = 'manager') {
  return {
    FollowUp: {
      find: filter => ({ select: async () => rows.filter(sift(filter)).map(row => ({ ...row })) }),
      updateOne: async (filter, update) => {
        beforeUpdate(rows);
        const row = rows.find(sift(filter));
        if (!row) return { modifiedCount: 0 };
        Object.assign(row, update.$set); return { modifiedCount: 1 };
      },
    },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: manager }) }) }) },
  };
}

test('仅重派普通提醒，重复扫描幂等；缺少健管归属不改', async () => {
  const rows = [{ ...base }, { ...base, _id: 'planner-task', sourceType: 'annual_service', assignedTo: 'planner' }];
  const models = harness(rows);
  assert.equal(await reconcileAnnualReminderAssignments(models), 1);
  assert.equal(await reconcileAnnualReminderAssignments(models), 0);
  assert.equal(rows[0].assignedTo, 'manager'); assert.equal(rows[1].assignedTo, 'planner');
  assert.equal(await reconcileAnnualReminderAssignments(harness([{ ...base }], undefined, null)), 0);
});

test('读取后完成、启动、转派或关联服务，不被迟到的校正覆盖', async () => {
  for (const patch of [{ status: 'completed' }, { status: 'in_progress' }, { assignedTo: 'new-owner' }, { serviceTracking: { linkId: 'link' } }, { workflowKey: 'booking' }]) {
    const rows = [{ ...base }];
    assert.equal(await reconcileAnnualReminderAssignments(harness(rows, current => Object.assign(current[0], patch))), 0);
    assert.equal(rows[0].assignedTo, patch.assignedTo || 'old');
  }
});
