const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizedFamilyMember } = require('../src/utils/authorizedFamilyMember');

const actor = { _id: 'a', tenantId: 'tenant' };
const rows = {
  a: { _id: 'a', tenantId: 'tenant', familyLinks: [{ linkedUser: 'b' }] },
  b: { _id: 'b', tenantId: 'tenant', patientCategory: 'adult', familyLinks: [{ linkedUser: 'a' }] },
};
const users = { findOne: query => {
  const lean = async () => {
  const row = rows[String(query._id)];
  if (!row || row.tenantId !== query.tenantId || row.isDeleted) return null;
  if (query.patientCategory && row.patientCategory === 'child') return null;
  return row;
  };
  return { lean, select: () => ({ lean }) };
} };

test('adult archive access requires reciprocal links in the same tenant', async () => {
  assert.equal((await authorizedFamilyMember(actor, 'b', users))?._id, 'b');
  rows.b.familyLinks = [];
  assert.equal(await authorizedFamilyMember(actor, 'b', users), null);
  rows.b.familyLinks = [{ linkedUser: 'a' }];
  rows.b.tenantId = 'other';
  assert.equal(await authorizedFamilyMember(actor, 'b', users), null);
  rows.b.tenantId = 'tenant';
  rows.b.patientCategory = 'child';
  assert.equal(await authorizedFamilyMember(actor, 'b', users), null);
});
