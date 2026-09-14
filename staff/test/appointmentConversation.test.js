import test from 'node:test'
import assert from 'node:assert/strict'
import { inferAppointmentConversation } from '../src/utils/appointmentConversation.js'

test('infers a weekday range and confirmed appointment request', () => {
  const result = inferAppointmentConversation([
    { type: 'user', content: '浙二的，李晨' },
    { type: 'user', content: '是的' },
    { type: 'user', content: '周三-五吧' },
  ], new Date('2026-09-14T08:00:00+08:00'))
  assert.equal(result.preferredDateStart, '2026-09-16')
  assert.equal(result.preferredDateEnd, '2026-09-18')
  assert.match(result.serviceContent, /浙二的，李晨/)
})
