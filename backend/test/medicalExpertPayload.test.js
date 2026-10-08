const test = require('node:test');
const assert = require('node:assert/strict');
const { medicalExpertPayload } = require('../src/utils/medicalExpertPayload');

test('editing a populated expert writes only editable fields', () => {
  const payload = medicalExpertPayload({
    _id: 'expert-id', tenantId: 'original-tenant', createdAt: 'old',
    name: '  张医生  ', institutionId: 'hospital-id', departmentId: 'department-id',
    expertise: '眩晕、头痛、眩晕', linkedStaffId: '', status: 'active',
  });
  assert.deepEqual(payload, {
    name: '张医生', institutionId: 'hospital-id', departmentId: 'department-id',
    status: 'active', expertise: ['眩晕', '头痛'], diseaseTags: [], serviceModes: [], linkedStaffId: null,
  });
  assert.equal('tenantId' in payload, false);
  assert.equal('_id' in payload, false);
});
