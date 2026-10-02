const test = require('node:test');
const assert = require('node:assert/strict');
const { formatCustomerNumber, parseCustomerNumber } = require('../../shared/customerNumber.cjs');

test('customer number is a stable reversible label for the existing customer id', () => {
  const id = '507f1f77bcf86cd799439011';
  assert.equal(formatCustomerNumber(id), 'KH-507F1F77BCF86CD799439011');
  assert.equal(parseCustomerNumber('kh-507f1f77bcf86cd799439011'), id);
  assert.equal(parseCustomerNumber('吴瑞砾'), '');
  assert.equal(formatCustomerNumber('not-an-id'), '');
});
