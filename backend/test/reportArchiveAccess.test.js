const test = require('node:test');
const assert = require('node:assert/strict');
const { reportOwner, canAccessReport } = require('../src/utils/reportArchiveAccess');

const mother = { _id: 'mother' };
const guardian = async (_user, id) => id === 'daughter' ? { child: { _id: 'daughter' } } : null;

test('reports default to the logged-in account and allow a directly linked child', async () => {
  assert.equal(await reportOwner(mother, '', guardian), 'mother');
  assert.equal(await reportOwner(mother, 'mother', guardian), 'mother');
  assert.equal(await reportOwner(mother, 'daughter', guardian), 'daughter');
  assert.equal(await canAccessReport(mother, { user: 'daughter' }, guardian), true);
});

test('adult family links and revoked guardian links do not expose reports', async () => {
  assert.equal(await reportOwner(mother, 'adult-family-member', guardian), null);
  assert.equal(await canAccessReport(mother, { user: 'adult-family-member' }, guardian), false);
  assert.equal(await canAccessReport(mother, { user: 'daughter' }, async () => null), false);
  assert.equal(await canAccessReport(mother, { title: 'missing owner' }, guardian), false);
});
