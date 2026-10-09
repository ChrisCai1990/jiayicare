const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../src/models/Order');
const FollowUp = require('../src/models/FollowUp');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const workflow = require('../src/utils/ibdWorkflow');
const { advisorDraft, customerHospitalFromText } = require('../../shared/ibdIntake.cjs');

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

    await workflow.start(order, 'planner1', { note: '已确认服务任务：客户希望下周就诊；客户意向机构：浙一医院' });
    assert.equal(tasks.get('ibd:advisor').assignedTo, 'advisor1');
    assert.equal(tasks.get('ibd:advisor').formData.hospital, '浙一医院');
    assert.equal(tasks.get('ibd:advisor').formData.department, '消化内科');
    assert.equal(tasks.has('ibd:booking'), false);
    assert.equal(updates.at(-1).currentStage, 'ibd_advisor');
    const advisor = tasks.get('ibd:advisor');
    advisor.status = 'completed';
    advisor.formData = { hospital: '测试医院', campus: '城中院区', department: '消化科', expert: '测试专家', visitPurpose: '首诊评估' };
    await workflow.advance(advisor);
    assert.equal(tasks.get('ibd:booking').assignedTo, 'manager1');
    assert.equal(tasks.get('ibd:booking').formData.proposal.hospital, '测试医院');
    assert.equal(tasks.get('ibd:booking').formData.campus, '城中院区');
    assert.equal(updates.at(-1).currentStage, 'ibd_booking');
    await workflow.advance(advisor);
    assert.equal(tasks.size, 2);
    order.supervisorId = 'planner1';
    const booking = tasks.get('ibd:booking');
    booking.formData = { proposal: advisor.formData, campus: '城中院区', appointmentDate: '2026-10-14', appointmentTime: '10:00' };
    await workflow.advance(booking);
    assert.equal(tasks.get('ibd:planner').assignedTo, 'planner1');
    assert.equal(tasks.get('ibd:planner').formData.campus, '城中院区');
    const planner = tasks.get('ibd:planner');
    planner.formData.escortStaffId = 'escort1';
    await workflow.advance(planner);
    assert.equal(tasks.get('ibd:escort').assignedTo, 'escort1');
    assert.equal(tasks.get('ibd:escort').formData.campus, '城中院区');
    await workflow.advance(tasks.get('ibd:escort'));
    assert.equal(updates.at(-1).currentStage, 'ibd_awaiting_first_visit');
  } finally {
    Order.findById = original.orderFindById; Order.updateOne = original.orderUpdateOne;
    FollowUp.findOne = original.taskFindOne; FollowUp.findOneAndUpdate = original.taskFindOneAndUpdate;
    FollowUp.updateMany = original.taskUpdateMany; User.findById = original.userFindById;
  }
});

test('customer hospital is carried forward without overwriting an advisor edit', () => {
  assert.equal(customerHospitalFromText('已确认服务任务：首诊；客户意向机构：浙一医院'), '浙一医院');
  assert.equal(advisorDraft({ customerRequest: '客户意向医院：浙一医院' }).hospital, '浙一医院');
  assert.equal(advisorDraft({ hospital: '顾问另选医院', department: '消化内科' }, '客户意向机构：浙一医院').hospital, '顾问另选医院');
});

test('IBD advisor cannot send incomplete recommendation and manager cannot claim unbooked visit', () => {
  assert.match(workflow.validate({ workflowKey: 'ibd:advisor' }, { status: 'completed', formData: { hospital: '测试医院' } }, { role: 'familyDoctor' }), /医院、科室、专家/);
  assert.match(workflow.validate({ workflowKey: 'ibd:booking' }, { status: 'completed', formData: {} }, { role: 'healthManager' }), /就诊日期/);
  assert.match(workflow.validate({ workflowKey: 'ibd:booking' }, { status: 'completed', formData: { appointmentDate: '2026-10-14', appointmentTime: '10:00' } }, { role: 'healthManager' }), /院区/);
  assert.equal(workflow.validate({ workflowKey: 'ibd:booking' }, { status: 'completed', formData: { appointmentDate: '2026-10-14', appointmentTime: '10:00', campus: '城中院区' } }, { role: 'healthManager' }), '');
  assert.match(workflow.validate({ workflowKey: 'ibd:planner' }, { status: 'completed', formData: {} }, { role: 'healthPlanner' }), /员工库/);
  assert.match(workflow.validate({ workflowKey: 'ibd:escort' }, { status: 'completed', formData: {} }, { role: 'medicalAssistant' }), /碰面地点/);
  assert.equal(workflow.validate({ workflowKey: 'ibd:booking' }, { status: 'in_progress', formData: {} }, { role: 'healthManager' }), '');
});

test('IBD booking requires a planner and planner assignment requires an active escort employee', async () => {
  const originalOrderFind = Order.findById;
  const originalAdminExists = Admin.exists;
  try {
    const order = { _id: 'order1', supervisorId: null, tenantId: 'tenant1' };
    Order.findById = async () => order;
    const booking = { workflowKey: 'ibd:booking', sourceOrderId: 'order1' };
    assert.match(await workflow.precheckAdvance(booking, { status: 'completed' }), /健康规划师/);
    order.supervisorId = 'planner1';
    assert.equal(await workflow.precheckAdvance(booking, { status: 'completed' }), '');
    const planner = { workflowKey: 'ibd:planner', sourceOrderId: 'order1' };
    assert.match(await workflow.precheckAdvance(planner, { status: 'completed', formData: { escortStaffId: 'invalid' } }), /员工库/);
    Admin.exists = async filter => {
      assert.equal(filter.role, 'medicalAssistant');
      assert.equal(filter.tenantId, 'tenant1');
      return true;
    };
    assert.equal(await workflow.precheckAdvance(planner, { status: 'completed', formData: { escortStaffId: '507f1f77bcf86cd799439011' } }), '');
  } finally {
    Order.findById = originalOrderFind;
    Admin.exists = originalAdminExists;
  }
});
