import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationTotal, taskProgress, followUpDateRange, filterReviewTodos, readableServiceText } from '../src/utils/staffWorkspace.js'

test('notification count includes messages and both referral queues, never adds sent pushes', () => {
  assert.equal(notificationTotal({ unreadMessageCount: 13, pushCount: 30 }), 13)
  assert.equal(notificationTotal({ unreadMessageCount: 4, pendingReferralCount: 2, unreadRepliedCount: 1 }), 7)
  assert.equal(notificationTotal({ unreadMessageCount: -1, pendingReferralCount: '3' }), 3)
})
test('pending work cannot be presented as complete, cancelled tasks do not block completion', () => {
  assert.equal(taskProgress([{ status: 'completed' }, { status: 'planned' }]).state, '进行中')
  assert.equal(taskProgress([{ status: 'completed' }, { status: 'cancelled' }]).state, '已完成')
  assert.equal(taskProgress([{ status: 'cancelled' }]).state, '待开始')
  assert.equal(taskProgress([{ status: 'unknown' }]).state, '进行中')
})
test('date shortcuts include previous-year overdue work and a seven-day inclusive window', () => {
  assert.deepEqual(followUpDateRange('overdue', '2026-01-01'), { from: '', to: '2025-12-31', status: 'active' })
  assert.deepEqual(followUpDateRange('week', '2026-12-29'), { from: '2026-12-29', to: '2027-01-04' })
  assert.deepEqual(followUpDateRange('all', '2026-09-29'), { from: '', to: '' })
})
test('review filtering retains source records and prioritizes old urgent work without closing any task', () => {
  const todos = [
    { id: 'new', patientName: '虚构甲', priority: 1, createdAt: '2026-09-28', overdue: true },
    { id: 'old', patientName: '虚构乙', priority: 3, createdAt: '2026-08-01', overdue: true },
    { id: 'risk', patientName: '虚构甲', priority: 1, createdAt: '2026-09-01', overdue: true },
    { id: 'unknown', createdAt: 'invalid', priority: 1 },
  ]
  const frozen = JSON.stringify(todos)
  assert.deepEqual(filterReviewTodos(todos, { priority: 'urgent', age: 'week', now: Date.parse('2026-09-29') }).map(t => t.id), ['risk'])
  assert.deepEqual(filterReviewTodos(todos, { query: '虚构乙' }).map(t => t.id), ['old'])
  assert.equal(filterReviewTodos(todos, { sort: 'oldest' })[0].id, 'old')
  assert.equal(JSON.stringify(todos), frozen)
})
test('display conversion leaves original evidence intact and readable clinical content unchanged', () => {
  const text = '服务类型：proxy_booking；复查原文（来源：priority:3）'
  assert.equal(readableServiceText(text), '服务类型：代预约；复查原文来源：方案依据（详见原方案）')
  assert.match(text, /priority:3/)
  assert.equal(readableServiceText('医师已核对 2026-09-01 报告'), '医师已核对 2026-09-01 报告')
})
