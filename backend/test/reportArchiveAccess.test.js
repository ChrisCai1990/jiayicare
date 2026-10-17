const test = require('node:test');
const assert = require('node:assert/strict');
const { reportOwner, canAccessReport, canManageReport } = require('../src/utils/reportArchiveAccess');

const mother = { _id: 'mother' };
const guardian = async (_user, id) => id === 'daughter' ? { child: { _id: 'daughter' } } : null;

test('reports default to the logged-in account and allow a directly linked child', async () => {
  assert.equal(await reportOwner(mother, '', guardian), 'mother');
  assert.equal(await reportOwner(mother, 'mother', guardian), 'mother');
  assert.equal(await reportOwner(mother, 'daughter', guardian), 'daughter');
  assert.equal(await canAccessReport(mother, { user: 'daughter' }, guardian), true);
});

test('authorized adult family and direct guardian can access reports; revoked relations cannot', async () => {
  const family = async (_user, id) => id === 'adult-family-member' ? { _id: id } : null;
  assert.equal(await reportOwner(mother, 'adult-family-member', guardian, family), 'adult-family-member');
  assert.equal(await canAccessReport(mother, { user: 'adult-family-member' }, guardian, family), true);
  assert.equal(await canManageReport(mother, { user: 'adult-family-member' }, guardian), false);
  assert.equal(await canManageReport(mother, { user: 'daughter' }, guardian), true);
  assert.equal(await canAccessReport(mother, { user: 'adult-family-member' }, guardian, async () => null), false);
  assert.equal(await canAccessReport(mother, { user: 'daughter' }, async () => null, async () => null), false);
  assert.equal(await canAccessReport(mother, { title: 'missing owner' }, guardian), false);
});
