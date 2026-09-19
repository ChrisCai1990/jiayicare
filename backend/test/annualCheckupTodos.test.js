const test = require('node:test')
const assert = require('node:assert/strict')
const { buildCheckupPreparationTodos: build } = require('../src/utils/checkupPreparationTodos')
const actor = { _id: 'planner', role: 'healthPlanner' }
const { buildPendingCheckupTodos: pending } = require('../src/utils/checkupPreparationTodos')
function pendingTask() { const x = link(); return { ...x.plannerTaskId, patientId: x.patientId, status: 'completed' } }
test('ready completed preparation stays actionable exactly once without new records', async () => {
  const task = pendingTask()
  const rows = await pending([task, task], [], actor, async () => ({ readyForServiceLink: true }))
  assert.equal(rows.length, 1); assert.equal(rows[0].taskId, 'task'); assert.equal(rows[0].type, 'checkup_handoff_pending')
  assert.match(rows[0].label, /待关联/)
  assert.match((await pending([task], [{ plannerTaskId: 'task', status: 'linked_pending_activation' }], actor, async () => ({ readyForServiceLink: true })))[0].label, /待启动/)
})
test('pending handoff hides waiting, active, failed, duplicate links and wrong owners', async () => {
  const task = pendingTask(), ready = async () => ({ readyForServiceLink: true })
  assert.deepEqual(await pending([task], [], actor, async () => ({ readyForServiceLink: false })), [])
  for (const status of ['active', 'activating', 'activation_failed']) assert.deepEqual(await pending([task], [{ plannerTaskId: 'task', status }], actor, ready), [])
  assert.deepEqual(await pending([task], [{ plannerTaskId: 'task' }, { plannerTaskId: 'task' }], actor, ready), [])
  assert.deepEqual(await pending([{ ...task, assignedTo: 'other' }], [], actor, ready), [])
  assert.deepEqual(await pending([{ ...task, patientId: { ...task.patientId, assignedHealthPlanner: 'other' } }], [], actor, ready), [])
  assert.deepEqual(await pending([task], [], { ...actor, role: 'healthManager' }, ready), [])
  assert.deepEqual(await pending([task], [], actor, async () => { throw Object.assign(Error('changed'), { statusCode: 403 }) }), [])
})
function link() {
  return { _id: 'link', annualPlanId: 'annual', status: 'active', completion: { status: 'attention', message: '核对核销' },
    patientId: { _id: 'patient', name: '客户', assignedHealthPlanner: 'planner' },
    plannerTaskId: { _id: 'task', patientId: 'patient', sourceAnnualPlanId: 'annual', assignedTo: 'planner', sourceType: 'annual_service',
      workflowKey: 'annual_checkup_preparation:healthPlanner', sourceScheduleKey: 'annual_checkup:2026-10-01:prepare:healthPlanner',
      formData: { annualCheckupPreparation: { version: 1, role: 'healthPlanner' } } } }
}
test('one read-only exception projection opens original task, duplicate source does not duplicate todos', () => {
  const item = link(), before = JSON.stringify(item)
  const todos = build([item, item], actor)
  assert.equal(todos.length, 1); assert.equal(todos[0].taskId, 'task'); assert.equal(todos[0].summary, '核对核销')
  assert.equal(JSON.stringify(item), before)
})
test('activation failure and completion attention share same stable entry', () => {
  const item = link(), id = build([item], actor)[0].id
  item.status = 'activation_failed'; item.activation = { message: '中断' }
  assert.equal(build([item], actor)[0].id, id); assert.equal(build([item], actor)[0].summary, '中断')
})
for (const [name, mutate] of Object.entries({
  'normal active': x => { x.completion = null },
  'completed': x => { x.completion.status = 'completed' },
  'running activation': x => { x.status = 'activating' },
  'changed customer ownership': x => { x.patientId.assignedHealthPlanner = 'other' },
  'changed task ownership': x => { x.plannerTaskId.assignedTo = 'other' },
  'wrong annual': x => { x.plannerTaskId.sourceAnnualPlanId = 'other' },
  'wrong customer': x => { x.plannerTaskId.patientId = 'other' },
  'missing patient': x => { x.patientId = null },
  'missing task': x => { x.plannerTaskId = null },
})) test(name + ' is not shown to planner', () => {
  const item = link(); mutate(item); assert.deepEqual(build([item], actor), [])
})
test('no leakage to unrelated roles; superadmin can inspect ownership mismatch', () => {
  for (const role of ['familyDoctor', 'healthManager', 'medicalAssistant']) assert.deepEqual(build([link()], { ...actor, role }), [])
  const item = link(); item.patientId.assignedHealthPlanner = 'other'
  assert.equal(build([item], { _id: 'admin', role: 'superadmin' }).length, 1)
})
