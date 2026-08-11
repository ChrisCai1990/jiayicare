const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkSmsRateLimit,
  recordSmsAttempt,
  resetSmsRateLimits,
} = require('../src/utils/smsRateLimiter');

test.beforeEach(() => resetSmsRateLimits());

test('enforces a 60 second cooldown per phone number', () => {
  const now = Date.now();
  recordSmsAttempt('13958025661', '127.0.0.1', now);
  const result = checkSmsRateLimit('13958025661', '127.0.0.2', now + 1000);
  assert.equal(result.allowed, false);
  assert.equal(result.retryAfterSeconds, 59);
});

test('allows another request after the cooldown', () => {
  const now = Date.now();
  recordSmsAttempt('13958025661', '127.0.0.1', now);
  assert.equal(checkSmsRateLimit('13958025661', '127.0.0.2', now + 60_000).allowed, true);
});

test('limits a phone number to five attempts per hour', () => {
  const now = Date.now();
  for (let index = 0; index < 5; index += 1) {
    recordSmsAttempt('13958025661', `127.0.0.${index + 1}`, now + index * 60_000);
  }
  const result = checkSmsRateLimit('13958025661', '127.0.0.99', now + 5 * 60_000);
  assert.equal(result.allowed, false);
  assert.match(result.message, /手机号/);
});

test('limits one source address to twenty attempts per hour', () => {
  const now = Date.now();
  for (let index = 0; index < 20; index += 1) {
    recordSmsAttempt(`1395802${String(index).padStart(4, '0')}`, '::ffff:10.0.0.1', now);
  }
  const result = checkSmsRateLimit('13958029999', '10.0.0.1', now + 60_000);
  assert.equal(result.allowed, false);
  assert.match(result.message, /请求次数/);
});
