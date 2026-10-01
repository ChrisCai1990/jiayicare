import test from 'node:test'
import assert from 'node:assert/strict'
import { buildExecutionRows, executionRowCategory, executionRowStatus, executionServiceCurrentTask } from '../src/utils/executionTaskRows.mjs'
import { serviceTaskGroupKey } from '../src/utils/plannerOrderProgress.mjs'

const order = { _id: 'order-1', serviceName: '专家约诊服务', status: 'completed' }
const stages = [
  { _id: 'booking', sourceType: 'order', sourceOrderId: order, workflowKey: 'medical_proxy:booking', theme: '体检资料和预约', status: 'completed', completedAt: '2026-09-28T10:00:00Z' },
  { _id: 'execute', sourceType: 'order', sourceOrderId: order, workflowKey: 'medical_proxy:execute', theme: '就医协助', status: 'planned' },
  { _id: 'supervise', sourceType: 'order', sourceOrderId: order, workflowKey: 'medical_proxy:supervise', theme: '客户沟通', status: 'in_progress' },
]

test('one completed expert appointment has one category, one status and all stage history', () => {
  const rows = buildExecutionRows(stages, task => task.sourceType === 'order', task => task.sourceOrderId._id)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].items.length, 3)
  assert.equal(executionRowCategory(rows[0]), 'medical')
  assert.equal(executionRowStatus(rows[0]), 'completed')
  assert.equal(executionServiceCurrentTask(rows[0])._id, 'booking')
  assert.deepEqual(['medical', 'checkup', 'communication'].map(category => rows.filter(row => executionRowCategory(row) === category).length), [1, 0, 0])
  assert.deepEqual(['planned', 'in_progress', 'completed'].map(status => rows.filter(row => executionRowStatus(row) === status).length), [0, 0, 1])
})

test('different orders remain separate and active service has one current status', () => {
  const second = { ...order, _id: 'order-2', status: 'processing' }
  const rows = buildExecutionRows([...stages, { ...stages[1], _id: 'second-execute', sourceOrderId: second }], task => task.sourceType === 'order', task => task.sourceOrderId._id)
  assert.equal(rows.length, 2)
  assert.equal(executionRowStatus(rows[1]), 'planned')
})

test('one insurance case with executor, supervisor and legacy row stays one service', () => {
  const tasks = [
    { _id: 'old', sourceType: 'scheduled', sourceId: 'case-1', theme: '高端医疗险：3月门诊报销', status: 'in_progress' },
    { _id: 'executor', sourceType: 'insurance_service', sourceId: 'case-1', taskRole: 'executor', theme: '高端医疗险：3月门诊报销', status: 'planned' },
    { _id: 'supervisor', sourceType: 'insurance_service', sourceId: 'case-1', theme: '高端医疗险督办：3月门诊报销', status: 'planned' },
  ]
  const rows = buildExecutionRows(tasks, task => Boolean(task.sourceId), task => `insurance:${task.sourceId}`)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].items.length, 3)
  assert.equal(new Set(tasks.map(serviceTaskGroupKey)).size, 1)
  assert.equal(executionRowCategory(rows[0]), 'insurance')
  assert.equal(executionRowStatus(rows[0]), 'in_progress')
  assert.equal(executionServiceCurrentTask(rows[0])._id, 'executor')
})
