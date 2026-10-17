const test = require('node:test');
const assert = require('node:assert/strict');
const FollowUp = require('../src/models/FollowUp');
const Order = require('../src/models/Order');
const User = require('../src/models/User');
const { reconcileForStaff } = require('../src/utils/legacyEscortBooking');

test('unstarted legacy escort returns to manager booking without losing its assistant', async () => {
  const original = { find: FollowUp.find, findOne: FollowUp.findOne, updateOne: FollowUp.updateOne,
    upsert: FollowUp.findOneAndUpdate, orderFind: Order.findById, orderList: Order.find,
    orderUpdate: Order.updateOne, userFind: User.findById, userList: User.find };
  const execution = { _id: 'execution', patientId: 'patient', staffId: 'advisor', assignedTo: 'assistant',
    status: 'planned', formData: { medicalEscort: true, assignmentMode: 'automatic' }, executedContent: '' };
  const order = { _id: 'order', user: 'patient', status: 'scheduled', currentStage: 'execute',
    scheduledAt: new Date('2026-10-20T01:00:00Z'), serviceName: '陪同看诊服务',
    medicalProxyPlan: { medicalEscort: true, initiationSource: 'staff_direct' } };
  let booking = null;
  let supervisorStage = 'execute';
  try {
    FollowUp.find = () => ({ select: () => ({ lean: async () => supervisorStage === 'execute' ? [{ sourceOrderId: 'order' }] : [] }) });
    FollowUp.findOne = query => ({ select: () => ({ lean: async () => query.workflowKey === 'medical_proxy:execute' ? execution : booking }) });
    FollowUp.updateOne = async (filter, update) => {
      if (filter._id === 'execution') { execution.status = update.$set.status; execution.cancelReason = update.$set.cancelReason; return { modifiedCount: 1 }; }
      supervisorStage = update.$set['formData.currentStage']; return { modifiedCount: 1 };
    };
    FollowUp.findOneAndUpdate = async (_filter, update) => { booking = update.$setOnInsert; return booking; };
    Order.findById = () => ({ select: () => ({ lean: async () => order }) });
    Order.find = () => ({ select: () => ({ lean: async () => [{ _id: 'order' }] }) });
    Order.updateOne = async (_filter, update) => { Object.assign(order, update.$set); return { modifiedCount: 1 }; };
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: 'manager', assignedHealthPlanner: 'planner' }) }) });
    User.find = () => ({ select: () => ({ lean: async () => [{ _id: 'patient' }] }) });
    assert.equal(await reconcileForStaff({ _id: 'manager', role: 'healthManager' }), 1);
    assert.equal(execution.status, 'cancelled');
    assert.equal(booking.assignedTo, 'manager');
    assert.equal(booking.formData.medicalAssistantId, 'assistant');
    assert.equal(order.currentStage, 'booking');
    assert.equal(supervisorStage, 'booking');
    assert.equal(await reconcileForStaff({ _id: 'planner', role: 'healthPlanner' }), 0);
  } finally {
    FollowUp.find = original.find; FollowUp.findOne = original.findOne; FollowUp.updateOne = original.updateOne;
    FollowUp.findOneAndUpdate = original.upsert; Order.findById = original.orderFind; Order.find = original.orderList;
    Order.updateOne = original.orderUpdate; User.findById = original.userFind; User.find = original.userList;
  }
});
