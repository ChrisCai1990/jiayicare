import test from 'node:test'
import assert from 'node:assert/strict'
import { orderConversationMessages } from '../src/utils/orderConversation.js'

test('order dialogue includes untagged customer replies after its confirmation prompt', () => {
  const messages = [
    { _id: 'older', createdAt: '2026-09-14T01:00:00Z', content: '旧话题' },
    { _id: 'prompt', createdAt: '2026-09-14T02:00:00Z', action: { type: 'order_planner_confirmation', orderId: 'order-a' } },
    { _id: 'staff', createdAt: '2026-09-14T02:01:00Z', action: { type: 'order_conversation', orderId: 'order-a' } },
    { _id: 'customer', createdAt: '2026-09-14T02:02:00Z', type: 'user', content: '暂时没有' },
    { _id: 'next-prompt', createdAt: '2026-09-14T03:00:00Z', action: { type: 'order_planner_confirmation', orderId: 'order-b' } },
  ]
  assert.deepEqual(orderConversationMessages(messages, 'order-a').map(message => message._id), ['prompt', 'staff', 'customer'])
  assert.deepEqual(orderConversationMessages(messages, 'order-b').map(message => message._id), ['next-prompt'])
})

test('orders without a confirmation prompt include later customer replies', () => {
  assert.deepEqual(orderConversationMessages([
    { _id: 'general', createdAt: '2026-09-14T01:00:00Z', action: null },
    { _id: 'linked', createdAt: '2026-09-14T02:00:00Z', action: { orderId: 'order-a' } },
    { _id: 'reply', createdAt: '2026-09-14T02:01:00Z', type: 'user' },
  ], 'order-a').map(message => message._id), ['linked', 'reply'])
})

test('explicit order message takes precedence over unrelated prompts after order creation', () => {
  assert.deepEqual(orderConversationMessages([
    { _id: 'old', createdAt: '2026-09-14T01:00:00Z' },
    { _id: 'other', createdAt: '2026-09-14T02:01:00Z', action: { type: 'order_planner_confirmation', orderId: 'order-b' } },
    { _id: 'staff', createdAt: '2026-09-14T03:02:00Z', action: { type: 'order_conversation', orderId: 'order-a' } },
    { _id: 'customer', createdAt: '2026-09-14T03:03:00Z', type: 'user' },
  ], 'order-a', '2026-09-14T02:00:00Z').map(message => message._id), ['staff', 'customer'])
})

test('staff can still see a reply explicitly sent to an earlier order', () => {
  assert.deepEqual(orderConversationMessages([
    { _id: 'first-prompt', createdAt: '2026-09-14T01:00:00Z', action: { type: 'order_planner_confirmation', orderId: 'order-a' } },
    { _id: 'first-customer', createdAt: '2026-09-14T01:01:00Z', type: 'user' },
    { _id: 'next-prompt', createdAt: '2026-09-14T02:00:00Z', action: { type: 'order_planner_confirmation', orderId: 'order-b' } },
    { _id: 'staff-reply', createdAt: '2026-09-14T02:01:00Z', action: { type: 'order_conversation', orderId: 'order-a' } },
  ], 'order-a').map(message => message._id), ['first-prompt', 'first-customer', 'staff-reply'])
})
