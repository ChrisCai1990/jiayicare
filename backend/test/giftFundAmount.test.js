const test = require('node:test');
const assert = require('node:assert/strict');
const { parseGiftFundAmount } = require('../src/utils/giftFundAmount');

test('accepts positive gift amounts with at most two decimal places', () => {
  for (const amount of [2513.8, 0.01, 1, '2513.80', '0.10']) {
    assert.equal(parseGiftFundAmount(amount), Number(amount));
  }
});

test('rejects invalid gift amounts without rounding them into valid amounts', () => {
  for (const amount of [0, -1, 1.234, '1.234', '', 'abc', null, Infinity, 1e20]) {
    assert.equal(parseGiftFundAmount(amount), null);
  }
});
