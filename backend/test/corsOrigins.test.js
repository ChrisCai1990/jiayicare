const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAllowedOrigins, createCorsOriginValidator } = require('../src/utils/corsOrigins');

test('staging accepts all fixed staging origins', () => {
  const origins = buildAllowedOrigins('staging');
  for (const origin of [
    'https://staging.jiaycare.com',
    'https://staging-jinyisen.jiaycare.com',
    'https://staging-admin.jiaycare.com',
    'https://staging-staff.jiaycare.com',
    'https://staging-api.jiaycare.com',
  ]) assert.ok(origins.includes(origin), origin);
});

test('production does not accept staging origins', () => {
  const origins = buildAllowedOrigins('production');
  assert.equal(origins.includes('https://staging-staff.jiaycare.com'), false);
  assert.ok(origins.includes('https://staff.jiaycare.com'));
});

test('rejected origins return a 403-classified error', () => {
  const validate = createCorsOriginValidator('staging');
  validate('https://example.invalid', error => assert.equal(error.status, 403));
});
