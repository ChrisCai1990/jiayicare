import test from 'node:test'
import assert from 'node:assert/strict'
import { isCustomerOrder, plannerOrderRows, serviceTaskGroupKey } from '../src/utils/plannerOrderProgress.mjs'

test('ongoing order remains visible after its intake follow-up disappears', () => {
  const supervisor = { _id: 'supervisor', sourceType: 'order', taskRole: 'supervisor', sourceOrderId: { _id: 'order-1', initiationSource: 'customer' } }
  assert.deepEqual(plannerOrderRows([], [supervisor]), [{ id: 'order-1', pending: null, supervisor, task: supervisor, action: null }])
})

test('pending order and its supervisor are shown once, other tasks do not become order progress', () => {
  const pending = { _id: 'intake', sourceOrderId: { _id: 'order-1', initiationSource: 'customer' } }
  const supervisor = { _id: 'supervisor', sourceType: 'order', taskRole: 'supervisor', sourceOrderId: { _id: 'order-1', initiationSource: 'customer' } }
  const executor = { _id: 'executor', sourceType: 'order', taskRole: 'executor', sourceOrderId: { _id: 'order-2', initiationSource: 'staff_direct' } }
  const rows = plannerOrderRows([pending], [supervisor, executor])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].pending, pending)
  assert.equal(rows[0].supervisor, supervisor)
})

test('staff-created services stay out of customer orders, including paid-looking labels', () => {
  const staffOrder = { _id: 'staff-order', initiationSource: 'staff_direct', paymentStatus: 'unpaid', serviceName: '专家约诊服务' }
  const staffTask = { _id: 'staff-task', sourceType: 'order', taskRole: 'supervisor', sourceOrderId: staffOrder }
  assert.equal(isCustomerOrder(staffOrder, staffTask), false)
  assert.deepEqual(plannerOrderRows([{ sourceOrderId: staffOrder }], [staffTask]), [])
  assert.equal(isCustomerOrder({ _id: 'old-paid', paymentStatus: 'paid' }), true)
})

test('planner action for a customer order is retained in its single progress row', () => {
  const sourceOrderId = { _id: 'order-1', initiationSource: 'customer', paymentStatus: 'paid' }
  const supervisor = { _id: 'supervisor', sourceType: 'order', taskRole: 'supervisor', sourceOrderId }
  const action = { _id: 'action', sourceType: 'order', taskRole: 'executor', sourceOrderId, isBlocked: false }
  const rows = plannerOrderRows([], [supervisor, action])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].supervisor, supervisor)
  assert.equal(rows[0].action, action)
})

test('legacy medication progress cannot hide the planner assignment task', () => {
  const sourceOrderId = { _id: 'order-medication', initiationSource: 'customer', paymentStatus: 'paid' }
  const progress = { _id: 'progress', sourceType: 'order', taskRole: 'executor', workflowKey: 'medication_proxy:progress', sourceOrderId, status: 'in_progress' }
  const assignment = { _id: 'assignment', sourceType: 'order', taskRole: 'executor', workflowKey: 'medication_proxy:planner', sourceOrderId, status: 'planned' }
  const [row] = plannerOrderRows([], [progress, assignment])
  assert.equal(row.supervisor, progress)
  assert.equal(row.action, assignment)
  assert.equal(plannerOrderRows([], [progress]).at(0).action, null)
})

test('one order has one service card but a second order remains distinct', () => {
  const one = { sourceType: 'order', sourceOrderId: { _id: 'order-1' } }
  assert.equal(serviceTaskGroupKey({ ...one, _id: 'supervisor', taskRole: 'supervisor' }), 'order:order-1')
  assert.equal(serviceTaskGroupKey({ ...one, _id: 'booking', taskRole: 'executor' }), 'order:order-1')
  assert.equal(serviceTaskGroupKey({ sourceType: 'order', sourceOrderId: { _id: 'order-2' } }), 'order:order-2')
})
