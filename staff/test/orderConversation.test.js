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

test('orders without a confirmation prompt fall back to explicit order messages', () => {
  assert.deepEqual(orderConversationMessages([
    { _id: 'general', action: null },
    { _id: 'linked', action: { orderId: 'order-a' } },
  ], 'order-a').map(message => message._id), ['linked'])
})
