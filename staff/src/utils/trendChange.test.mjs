import test from 'node:test'
import assert from 'node:assert/strict'
import { trendChange } from './trendChange.mjs'

test('reports the absolute change between displayed endpoints', () => {
  assert.deepEqual(trendChange([{ y: 108.4 }, { y: 108.1 }, { y: 106.3 }]), {
    first: 108.4, last: 106.3, direction: '下降', amount: 2.1,
  })
  assert.deepEqual(trendChange([{ y: 6.5 }, { y: 7.1 }]), {
    first: 6.5, last: 7.1, direction: '上升', amount: 0.6,
  })
  assert.equal(trendChange([{ y: 7 }, { y: 7 }]).direction, '持平')
})

test('requires two valid measurements', () => {
  assert.equal(trendChange([{ y: 6.5 }]), null)
  assert.equal(trendChange([{ y: NaN }, { y: 7 }]), null)
})
