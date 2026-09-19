require('express-async-errors');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const FollowUp = require('../src/models/FollowUp');
const Link = require('../src/models/FollowUpServiceLink');
const Order = require('../src/models/Order');
const sync = require('../src/utils/followUpServiceLink');
const ids = { request: '000000000000000000000001', parent: '000000000000000000000002', patient: '000000000000000000000003', planner: '000000000000000000000004', target: '000000000000000000000005', manager: '000000000000000000000006' };
let actor;
const authPath = require.resolve('../src/middleware/staffAuth');
require(authPath);
require.cache[authPath].exports = (req, res, next) => { req.staff = actor; next(); };
sync.reconcileServiceLinks = async () => 0; // 本文件只验证HTTP授权及关联边界；状态回写单独测试。
const router = require('../src/routes/followUpServices');
const task = { _id: ids.request, patientId: ids.patient, assignedTo: ids.planner, status: 'planned', taskRole: 'supervisor', sourceType: 'professional_assessment', workflowKey: 'professional_assessment:service_request', formData: { linkedFollowUpActionKey: 'approved-assessment:dynamic:0' } };

async function request(t, body) {
  const app = express();
  app.use(express.json()); app.use('/followups', router);
  app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/followups/${ids.request}/service-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test('不是本需求负责人不能关联服务', async t => {
  actor = { _id: ids.manager, role: 'healthManager' };
  t.mock.method(FollowUp, 'findById', async () => task);
  assert.equal((await request(t, {})).status, 403);
});

test('服务查询必须限定同一客户，并拒绝不存在或非有效服务', async t => {
  actor = { _id: ids.planner, role: 'healthPlanner' };
  t.mock.method(FollowUp, 'findById', async () => task);
  t.mock.method(FollowUp, 'findOne', async query => {
    assert.equal(query.patientId, ids.patient);
    assert.equal(query.assessmentActionKey, task.formData.linkedFollowUpActionKey);
    return { _id: ids.parent, assignedTo: ids.manager };
  });
  t.mock.method(Order, 'findOne', query => {
    assert.equal(query.user, ids.patient); assert.equal(query.orderType, 'service');
    return { lean: async () => null };
  });
  t.mock.method(Link, 'findOne', async () => null);
  assert.equal((await request(t, { targetType: 'order', targetId: ids.target, followUpId: ids.parent })).status, 409);
});

test('进行中的关联不允许换成另一个服务', async t => {
  actor = { _id: ids.planner, role: 'healthPlanner' };
  t.mock.method(FollowUp, 'findById', async () => task);
  t.mock.method(FollowUp, 'findOne', async () => ({ _id: ids.parent, assignedTo: ids.manager }));
  t.mock.method(Order, 'findOne', () => ({ lean: async () => ({ status: 'scheduled', serviceName: '检查服务' }) }));
  t.mock.method(Link, 'findOne', async () => ({ status: 'waiting', followUpId: ids.parent, targetType: 'order', targetId: 'another-order' }));
  assert.equal((await request(t, { targetType: 'order', targetId: ids.target, followUpId: ids.parent })).status, 409);
});

test('同一随访被另一需求占用时返回冲突，不创建第二条绑定', async t => {
  actor = { _id: ids.planner, role: 'healthPlanner' };
  t.mock.method(FollowUp, 'findById', async () => task);
  t.mock.method(FollowUp, 'findOne', async () => ({ _id: ids.parent, assignedTo: ids.manager }));
  t.mock.method(Order, 'findOne', () => ({ lean: async () => ({ status: 'scheduled', serviceName: '检查服务' }) }));
  t.mock.method(Link, 'findOne', async () => null);
  t.mock.method(Link, 'create', async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  assert.equal((await request(t, { targetType: 'order', targetId: ids.target, followUpId: ids.parent })).status, 409);
});

test('有效服务只建立关联并回读任务，不改写订单的岗位流转', async t => {
  actor = { _id: ids.planner, role: 'healthPlanner' };
  t.mock.method(FollowUp, 'findById', () => Object.assign(Promise.resolve(task), { populate: async () => task }));
  t.mock.method(FollowUp, 'findOne', async () => ({ _id: ids.parent, assignedTo: ids.manager }));
  t.mock.method(Order, 'findOne', () => ({ lean: async () => ({ status: 'scheduled', serviceName: '检查服务' }) }));
  t.mock.method(Order, 'updateOne', () => { throw new Error('关联不得改写订单'); });
  t.mock.method(Link, 'findOne', async () => null);
  let saved;
  t.mock.method(Link, 'create', async row => { saved = row; return { ...row, _id: 'link' }; });
  const result = await request(t, { targetType: 'order', targetId: ids.target, followUpId: ids.parent });
  assert.equal(result.status, 200);
  assert.equal(saved.followUpId, ids.parent); assert.equal(saved.requestTaskId, ids.request);
  assert.equal(saved.patientId, ids.patient); assert.equal(saved.linkedBy, ids.planner);
});
