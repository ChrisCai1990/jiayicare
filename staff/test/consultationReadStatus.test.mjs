import test from 'node:test'
import assert from 'node:assert/strict'
import { consultationReadStatus as status } from '../src/utils/consultationReadStatus.mjs'
test('receipt distinguishes dispatch, historical unknown, revisions and per-expert reads', () => {
  const referral = { _id: 'r', contentVersion: 31 }
  assert.equal(status({}, referral), '暂无查看记录')
  assert.equal(status({ dispatchedAt: 'now' }, referral), '已推送 · 未查看')
  const read = { viewedAt: 'now', viewedReferralId: 'r', viewedVersion: 31 }
  assert.equal(status(read, referral), '已查看')
  assert.equal(status({ ...read, repliedAt: 'now' }, referral), '已回复')
  assert.equal(status(read, { ...referral, contentVersion: 32 }), '资料已更新，待再次查看')
  assert.equal(status({ ...read, repliedAt: 'now' }, { ...referral, _id: 'other' }), '资料已更新，待再次查看')
  assert.equal(status({ dispatchedAt: 'now' }, referral), '已推送 · 未查看')
})
