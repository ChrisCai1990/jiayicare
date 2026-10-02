const test = require('node:test');
const assert = require('node:assert/strict');
const { hasTenantChannel } = require('../src/utils/tenantChannel');

test('legacy Jia remains available while external institutions require explicit channel grants', () => {
  assert.equal(hasTenantChannel({ code: 'jiayihui' }, 'admin'), true);
  assert.equal(hasTenantChannel({ code: 'jiayihui' }, 'staff'), true);
  assert.equal(hasTenantChannel({ code: 'mingdahealth', serviceScope: [] }, 'admin'), false);
  assert.equal(hasTenantChannel({ code: 'mingdahealth', serviceScope: ['admin'] }, 'staff'), false);
  assert.equal(hasTenantChannel({ code: 'mingdahealth', serviceScope: ['admin', 'staff'] }, 'staff'), true);
});
