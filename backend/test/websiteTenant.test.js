const test = require('node:test');
const assert = require('node:assert/strict');
const Tenant = require('../src/models/Tenant');
const { normalizeWebsiteHost, normalizeWebsiteHosts, resolveWebsiteTenant } = require('../src/utils/websiteTenant');

test('website hosts are canonical and cannot contain paths or wildcards', () => {
  assert.equal(normalizeWebsiteHost('https://Care.Example.com/'), 'care.example.com');
  assert.deepEqual(normalizeWebsiteHosts(['care.example.com', 'https://CARE.example.com', 'other.example.com']), ['care.example.com', 'other.example.com']);
  for (const value of ['*.example.com', 'https://example.com/path', 'http://example.com', 'https://user@example.com']) assert.throws(() => normalizeWebsiteHost(value));
});

test('public website ownership follows registered host and rejects mismatch or missing binding', async () => {
  const original = Tenant.find;
  const seen = [];
  Tenant.find = filter => {
    seen.push(filter);
    const owners = { 'care-a.example.com': { _id: 'a', name: '甲机构' }, 'care-b.example.com': { _id: 'b', name: '乙机构' } };
    const owner = owners[filter.websiteHosts];
    return { select: () => ({ limit: () => ({ lean: async () => owner ? [owner] : [] }) }) };
  };
  const req = (host, origin = `https://${host}`) => ({ get: key => key === 'host' ? host : key === 'origin' ? origin : undefined });
  try {
    assert.deepEqual(await resolveWebsiteTenant(req('care-a.example.com')), { tenantId: 'a', siteHost: 'care-a.example.com', tenantName: '甲机构' });
    assert.deepEqual(await resolveWebsiteTenant(req('care-b.example.com')), { tenantId: 'b', siteHost: 'care-b.example.com', tenantName: '乙机构' });
    await assert.rejects(resolveWebsiteTenant(req('care-a.example.com', 'https://care-b.example.com')), { status: 403 });
    await assert.rejects(resolveWebsiteTenant(req('unknown.example.com')), { status: 403 });
    assert.deepEqual(seen.map(row => row.websiteHosts), ['care-a.example.com', 'care-b.example.com', 'unknown.example.com']);
  } finally { Tenant.find = original; }
});
