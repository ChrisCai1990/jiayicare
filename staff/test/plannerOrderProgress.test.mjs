import test from 'node:test'
import assert from 'node:assert/strict'
import { plannerOrderRows } from '../src/utils/plannerOrderProgress.mjs'

test('ongoing order remains visible after its intake follow-up disappears', () => {
  const supervisor = { _id: 'supervisor', sourceType: 'order', taskRole: 'supervisor', sourceOrderId: { _id: 'order-1' } }
  assert.deepEqual(plannerOrderRows([], [supervisor]), [{ id: 'order-1', pending: null, supervisor }])
})

test('pending order and its supervisor are shown once, other tasks do not become order progress', () => {
  const pending = { _id: 'intake', sourceOrderId: { _id: 'order-1' } }
  const supervisor = { _id: 'supervisor', sourceType: 'order', taskRole: 'supervisor', sourceOrderId: { _id: 'order-1' } }
  const executor = { _id: 'executor', sourceType: 'order', taskRole: 'executor', sourceOrderId: { _id: 'order-2' } }
  const rows = plannerOrderRows([pending], [supervisor, executor])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].pending, pending)
  assert.equal(rows[0].supervisor, supervisor)
})
