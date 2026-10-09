const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../src/models/Order');
const FollowUp = require('../src/models/FollowUp');
const User = require('../src/models/User');
const workflow = require('../src/utils/ibdWorkflow');

test('IBD planner handoff reaches advisor first, then manager after advisor confirmation', async () => {
  const original = {
    orderFindById: Order.findById, orderUpdateOne: Order.updateOne,
    taskFindOne: FollowUp.findOne, taskFindOneAndUpdate: FollowUp.findOneAndUpdate,
    taskUpdateMany: FollowUp.updateMany, userFindById: User.findById,
  };
  const tasks = new Map();
  const order = { _id: 'order1', user: 'customer1', serviceName: 'IBD 年度专病管理服务',
    specialtyTermsSnapshot: { key: 'ibd' } };
  const assignments = { assignedFamilyDoctor: 'advisor1', assignedHealthManager: 'manager1' };
  const updates = [];
  try {
    Order.findById = async () => order;
    Order.updateOne = async (_filter, update) => { updates.push(update.$set); return { modifiedCount: 1 }; };
    User.findById = () => ({ select: () => ({ lean: async () => assignments }) });
    FollowUp.findOne = async filter => {
      const found = tasks.get(filter.workflowKey);
      return found && (!filter.status || filter.status === found.status) ? found : null;
    };
    FollowUp.findOneAndUpdate = async (filter, update) => {
      if (!tasks.has(filter.workflowKey)) tasks.set(filter.workflowKey, { ...update.$setOnInsert, _id: filter.workflowKey });
      return tasks.get(filter.workflowKey);
    };
    FollowUp.updateMany = async () => ({ modifiedCount: 1 });

    await workflow.start(order, 'planner1', { note: '已确认服务任务：客户希望下周就诊' });
    assert.equal(tasks.get('ibd:advisor').assignedTo, 'advisor1');
    assert.equal(tasks.has('ibd:booking'), false);
    assert.equal(updates.at(-1).currentStage, 'ibd_advisor');
    const advisor = tasks.get('ibd:advisor');
    advisor.status = 'completed';
    advisor.formData = { hospital: '测试医院', department: '消化科', expert: '测试专家', visitPurpose: '首诊评估' };
    await workflow.advance(advisor);
    assert.equal(tasks.get('ibd:booking').assignedTo, 'manager1');
    assert.equal(tasks.get('ibd:booking').formData.proposal.hospital, '测试医院');
    assert.equal(updates.at(-1).currentStage, 'ibd_booking');
    await workflow.advance(advisor);
    assert.equal(tasks.size, 2);
  } finally {
    Order.findById = original.orderFindById; Order.updateOne = original.orderUpdateOne;
    FollowUp.findOne = original.taskFindOne; FollowUp.findOneAndUpdate = original.taskFindOneAndUpdate;
    FollowUp.updateMany = original.taskUpdateMany; User.findById = original.userFindById;
  }
});

test('IBD advisor cannot send incomplete recommendation and manager cannot claim unbooked visit', () => {
  assert.match(workflow.validate({ workflowKey: 'ibd:advisor' }, { status: 'completed', formData: { hospital: '测试医院' } }, { role: 'familyDoctor' }), /医院、科室、专家/);
  assert.match(workflow.validate({ workflowKey: 'ibd:booking' }, { status: 'completed', formData: {} }, { role: 'healthManager' }), /就诊日期/);
  assert.equal(workflow.validate({ workflowKey: 'ibd:booking' }, { status: 'in_progress', formData: {} }, { role: 'healthManager' }), '');
});
