import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileConversationMessages } from './conversationMessages.js'

const signed = (expires, signature) => `https://private-oss.example/messages/photo.jpg?Expires=${expires}&Signature=${signature}`

test('refreshes an expired photo link while a staff conversation remains open', () => {
  const oldUrl = signed(Math.floor(Date.now() / 1000) - 1, 'old')
  const freshUrl = signed(Math.floor(Date.now() / 1000) + 600, 'fresh')
  const previous = [{ _id: 'photo', content: '图片记录', imageUrl: oldUrl, imageUrls: [oldUrl] }]
  const incoming = [{ _id: 'photo', content: '图片记录', imageUrl: freshUrl, imageUrls: [freshUrl] }]

  const result = reconcileConversationMessages(previous, incoming)
  assert.equal(result[0].imageUrl, freshUrl)
  assert.deepEqual(result[0].imageUrls, [freshUrl])
  assert.notEqual(result, previous)
})

test('keeps a loaded photo until its signature is near expiry', () => {
  const oldUrl = signed(Math.floor(Date.now() / 1000) + 300, 'old')
  const freshUrl = signed(Math.floor(Date.now() / 1000) + 600, 'fresh')
  const previous = [{ _id: 'photo', content: '图片记录', imageUrl: oldUrl, imageUrls: [oldUrl] }]
  const incoming = [{ _id: 'photo', content: '图片记录', imageUrl: freshUrl, imageUrls: [freshUrl] }]

  assert.equal(reconcileConversationMessages(previous, incoming), previous)
})
