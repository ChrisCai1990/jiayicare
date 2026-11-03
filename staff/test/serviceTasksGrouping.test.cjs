const test = require('node:test')
const assert = require('node:assert/strict')

test('one service card retains closure and feedback actions instead of hiding them behind supervision', async () => {
  const { groupServiceTasks } = await import('../src/utils/workbenchReminder.mjs')
  const base = { sourceType: 'order', sourceOrderId: 'order', status: 'planned' }
  const supervisor = { ...base, _id: 'supervisor', taskRole: 'supervisor' }
  const execution = { ...base, _id: 'execution', taskRole: 'executor' }
  const feedback = { ...execution, _id: 'feedback', feedbackReview: true }
  const closure = { ...execution, _id: 'closure', workflowKey: 'medical_assist:closure' }
  assert.equal(groupServiceTasks([supervisor, execution])[0].task._id, 'execution')
  assert.equal(groupServiceTasks([supervisor, execution, feedback])[0].task._id, 'feedback')
  assert.equal(groupServiceTasks([supervisor, execution, feedback, closure])[0].task._id, 'closure')
  assert.equal(groupServiceTasks([supervisor, execution, { ...execution, sourceOrderId: 'another' }]).length, 2)
})
