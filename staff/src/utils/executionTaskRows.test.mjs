import test from 'node:test'
import assert from 'node:assert/strict'
import { buildExecutionRows, executionRowStatus, executionServiceCurrentTask } from './executionTaskRows.mjs'

test('completed insurance execution is not shown as ongoing because planner supervision is pending', () => {
  const tasks = [
    { _id: 'done', sourceType: 'insurance_service', sourceId: 'case', taskRole: 'executor', status: 'completed', completedAt: '2026-10-16T05:20:24Z' },
    { _id: 'planner', sourceType: 'insurance_service', sourceId: 'case', taskRole: 'supervisor', status: 'planned' },
    { _id: 'duplicate', sourceType: 'insurance_service', sourceId: 'case', taskRole: 'executor', status: 'cancelled' },
  ]
  const [row] = buildExecutionRows(tasks, () => true, task => `insurance:${task.sourceId}`)
  assert.equal(executionServiceCurrentTask(row)._id, 'done')
  assert.equal(executionRowStatus(row), 'completed')
})
