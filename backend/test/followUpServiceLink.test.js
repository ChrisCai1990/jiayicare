const test = require('node:test');
const assert = require('node:assert/strict');
const { serviceOutcome, taskProjection, isServiceRequest } = require('../src/utils/followUpServiceState');

test('现场预约未回填时，服务完成不能伪造关联随访完成', async t => {
  const Link = require('../src/models/FollowUpServiceLink'), FollowUp = require('../src/models/FollowUp'), Order = require('../src/models/Order');
  const link = { _id: 'l', __v: 0, status: 'waiting', targetType: 'order', targetId: 'o', patientId: 'p', followUpId: 'f', requestTaskId: 'r' };
  t.mock.method(Link, 'find', () => ({ lean: async () => [link] }));
  t.mock.method(Order, 'findOne', () => ({ lean: async () => ({ status: 'completed' }) }));
  t.mock.method(FollowUp, 'findById', () => ({ lean: async () => ({ annualBooking: { entries: [{ mode: 'onsite', status: 'pending' }] } }) }));
  t.mock.method(Link, 'findOneAndUpdate', (q,u) => { assert.equal(u.$set.status, 'waiting'); assert.match(u.$set.message, /现场预约/); return { lean: async () => ({ ...link, ...u.$set, __v: 1 }) }; });
  t.mock.method(FollowUp, 'updateMany', async (q,u) => { assert.equal(u.$set.status, 'in_progress'); });
  await require('../src/utils/followUpServiceLink').reconcileServiceLinks({});
});

test('只有完整服务完成才关闭随访，预约和部分核销保持进行中', () => {
  for (const target of [{ status: 'pending' }, { status: 'scheduled' }, { status: 'scheduled', totalUnits: 3, usedUnits: 1 }]) {
    assert.equal(serviceOutcome('order', target).status, 'waiting');
  }
  assert.equal(serviceOutcome('order', { status: 'completed', totalUnits: 3, usedUnits: 1 }).status, 'attention');
  assert.equal(serviceOutcome('order', { status: 'completed', totalUnits: 3, usedUnits: 3 }).status, 'completed');
  assert.equal(serviceOutcome('order', { status: 'completed' }).status, 'completed');
  assert.equal(serviceOutcome('health_plan', { status: 'completed' }).status, 'completed');
});

test('取消、退款、执行失败、缺失记录交回人工，不伪造完成', () => {
  for (const target of [null, { status: 'cancelled' }, { tradeStatus: 'refunded' }, { refundStatus: 'processing' }, { paymentStatus: 'refunded' }, { fulfillmentStatus: 'failed' }, { supervisionStatus: 'needs_attention' }]) {
    assert.equal(serviceOutcome('order', target).status, 'attention');
  }
  assert.equal(serviceOutcome('order', { status: 'completed', refundStatus: 'refunded' }).status, 'attention');
  assert.equal(serviceOutcome('order', { status: 'scheduled', refundStatus: 'failed' }).status, 'waiting');
});

test('进度只读、异常解锁、成功自动完成使用一致的岗位任务投影', () => {
  const now = new Date('2026-10-01T01:00:00Z');
  const base = { _id: 'link', __v: 3, title: '体检服务', targetType: 'health_plan', targetId: 'plan' };
  const waiting = taskProjection({ ...base, status: 'waiting' }, now);
  assert.equal(waiting.status, 'in_progress'); assert.equal(waiting.isBlocked, true); assert.equal(waiting.completedAt, null);
  const attention = taskProjection({ ...base, status: 'attention' }, now);
  assert.equal(attention.status, 'planned'); assert.equal(attention.isBlocked, false); assert.equal(attention.remindAt, now);
  const complete = taskProjection({ ...base, status: 'completed' }, now);
  assert.equal(complete.status, 'completed'); assert.equal(complete.completedAt, now); assert.equal(complete.serviceTracking.revision, 3);
});

test('原有订单专用流程和普通随访不能充当新增服务需求', () => {
  assert.equal(isServiceRequest({ sourceType: 'order', workflowKey: 'medical_proxy:supervise', taskRole: 'supervisor' }), false);
  assert.equal(isServiceRequest({ sourceType: 'professional_assessment', workflowKey: 'professional_assessment:dynamic_followup', taskRole: '' }), false);
  assert.equal(isServiceRequest({ sourceType: 'professional_assessment', workflowKey: 'professional_assessment:service_request', taskRole: 'supervisor' }), true);
  assert.equal(isServiceRequest({ sourceType: 'annual_service', workflowKey: 'service_request', taskRole: 'supervisor' }), true);
});

test('投影只更新同一关联的较旧版本，重复核验不覆盖人工处理结果', async t => {
  const FollowUp = require('../src/models/FollowUp');
  const { projectLink } = require('../src/utils/followUpServiceLink');
  let filter;
  t.mock.method(FollowUp, 'findById', () => ({ lean: async () => ({}) }));
  t.mock.method(FollowUp, 'updateMany', async query => { filter = query; return { modifiedCount: 0 }; });
  await projectLink({ _id: 'link', __v: 4, requestTaskId: 'request', followUpId: 'parent', patientId: 'patient', status: 'attention', title: 'service' });
  assert.deepEqual(filter._id.$in, ['request', 'parent']);
  assert.equal(filter.patientId, 'patient');
  assert.deepEqual(filter.$or[1], { 'serviceTracking.linkId': 'link', 'serviceTracking.revision': { $lt: 4 } });
  assert.deepEqual(filter.$and[0].$or[0].status.$nin, ['completed', 'cancelled']);
});

test('已交人工处理的异常不会因旧服务再次完成而自动关闭', async t => {
  const Link = require('../src/models/FollowUpServiceLink');
  const FollowUp = require('../src/models/FollowUp');
  const Order = require('../src/models/Order');
  const { reconcileServiceLinks } = require('../src/utils/followUpServiceLink');
  t.mock.method(Link, 'find', () => ({ lean: async () => [{ _id: 'link', __v: 2, status: 'attention', targetType: 'order', requestTaskId: 'request', followUpId: 'parent', patientId: 'patient' }] }));
  t.mock.method(Order, 'findOne', () => { throw new Error('旧来源不应重新裁决异常'); });
  let patch;
  t.mock.method(FollowUp, 'findById', () => ({ lean: async () => ({}) }));
  t.mock.method(FollowUp, 'updateMany', async (_, update) => { patch = update.$set; });
  assert.equal(await reconcileServiceLinks({}), 1);
  assert.equal(patch.status, 'planned');
});

test('原管理计划与服务岗位分别投影，核销完成不结束管理计划', async t => {
  const FollowUp = require('../src/models/FollowUp');
  t.mock.method(FollowUp, 'findById', () => ({ lean: async () => ({ sourceType: 'scheduled', sourceScheduleKey: 'annual_checkup:2026-10-01' }) }));
  let staffPatch, parentPatch, parentFilter;
  t.mock.method(FollowUp, 'updateMany', async (q, u) => { assert.deepEqual(q._id.$in, ['request']); staffPatch = u.$set; });
  t.mock.method(FollowUp, 'updateOne', async (q, u) => { parentFilter = q; parentPatch = u.$set; });
  await require('../src/utils/followUpServiceLink').projectLink({ _id: 'link', __v: 4, requestTaskId: 'request', followUpId: 'parent', patientId: 'patient', status: 'completed' });
  assert.equal(staffPatch.status, 'completed'); assert.equal(parentPatch.status, 'in_progress'); assert.equal(parentPatch.isBlocked, false);
  assert.equal(parentPatch.completedAt, null); assert.deepEqual(parentFilter.status.$nin, ['completed', 'cancelled']); assert.equal(parentFilter.outcomeReview, null);
});
