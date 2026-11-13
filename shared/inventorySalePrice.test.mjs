import assert from 'node:assert/strict'
import test from 'node:test'
import { salePriceLabelForUnits } from './inventorySalePrice.mjs'

const prices = [{ label:'1盒', units:1, price:2380 }, { label:'4盒', units:4, price:6800 }]

test('four boxes select the package price even after a one-box selection', () => {
  assert.equal(salePriceLabelForUnits(prices, 4, '1盒'), '4盒')
  assert.equal(salePriceLabelForUnits(prices, 4), '4盒')
  assert.equal(salePriceLabelForUnits(prices, 1, '4盒'), '1盒')
})

test('multiples keep an explicit package while empty and invalid quantities clear it', () => {
  assert.equal(salePriceLabelForUnits(prices, 8, '4盒'), '4盒')
  assert.equal(salePriceLabelForUnits(prices, 8), '')
  assert.equal(salePriceLabelForUnits(prices, '', '4盒'), '')
  assert.equal(salePriceLabelForUnits(prices, 1.5, '1盒'), '')
})
