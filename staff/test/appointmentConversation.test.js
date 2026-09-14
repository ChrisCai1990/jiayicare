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

test('extracts explicit dates and customer need from the AI conversation summary', () => {
  const result = inferAppointmentConversation([
    { type: 'user', content: '好的' },
    { type: 'planner', isAI: true, content: '已记录。期望时间：2026年9月20日至2026年9月22日；服务内容：预约浙一心内科；客户诉求：希望预约张医生并尽量安排上午。' },
  ], new Date('2026-09-14T08:00:00+08:00'))
  assert.equal(result.preferredDateStart, '2026-09-20')
  assert.equal(result.preferredDateEnd, '2026-09-22')
  assert.equal(result.serviceContent, '预约浙一心内科')
  assert.equal(result.customerNeed, '希望预约张医生并尽量安排上午。')
})

test('extracts a relative date from user dialogue', () => {
  const result = inferAppointmentConversation([
    { type: 'user', content: '后天想去浙二看消化科' },
  ], new Date('2026-09-14T08:00:00+08:00'))
  assert.equal(result.preferredDateStart, '2026-09-16')
  assert.equal(result.preferredDateEnd, '2026-09-16')
  assert.match(result.customerNeed, /消化科/)
})
