const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { reviewConfig, canAttempt, recordAttempt, validCredentials } = require('../src/utils/reviewExperience');

const envKeys = ['REVIEW_LOGIN_USER_ID', 'REVIEW_LOGIN_USERNAME', 'REVIEW_LOGIN_PASSWORD_SHA256', 'REVIEW_LOGIN_EXPIRES_AT'];
const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

test.after(() => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

test('review login stays disabled without a complete, unexpired configuration', () => {
  for (const key of envKeys) delete process.env[key];
  assert.equal(reviewConfig().enabled, false);
  process.env.REVIEW_LOGIN_USER_ID = '0123456789abcdef01234567';
  process.env.REVIEW_LOGIN_PASSWORD_SHA256 = crypto.createHash('sha256').update('test-only-secret').digest('hex');
  process.env.REVIEW_LOGIN_EXPIRES_AT = '2000-01-01T00:00:00Z';
  assert.equal(reviewConfig().enabled, false);
});

test('review credentials match only the configured account and password', () => {
  process.env.REVIEW_LOGIN_USER_ID = '0123456789abcdef01234567';
  process.env.REVIEW_LOGIN_USERNAME = 'review-check';
  process.env.REVIEW_LOGIN_PASSWORD_SHA256 = crypto.createHash('sha256').update('test-only-secret').digest('hex');
  process.env.REVIEW_LOGIN_EXPIRES_AT = '2099-01-01T00:00:00Z';
  const config = reviewConfig();
  assert.equal(config.enabled, true);
  assert.equal(validCredentials(config, 'review-check', 'test-only-secret'), true);
  assert.equal(validCredentials(config, 'review-check', 'wrong'), false);
  assert.equal(validCredentials(config, 'another-user', 'test-only-secret'), false);
});

test('review password attempts are limited per source address', () => {
  const ip = `review-test-${Date.now()}`;
  const now = Date.now();
  for (let i = 0; i < 5; i += 1) recordAttempt(ip, now);
  assert.equal(canAttempt(ip, now + 1000).allowed, false);
  assert.equal(canAttempt(ip, now + 15 * 60 * 1000).allowed, true);
});
