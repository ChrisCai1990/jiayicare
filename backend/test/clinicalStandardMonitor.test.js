const test = require('node:test');
const assert = require('node:assert/strict');
const { standards } = require('../../shared/clinicalStandards.cjs');
const { canonicalContent, fetchFingerprint, checkOne } = require('../src/utils/clinicalStandardMonitor');
const ClinicalStandardWatch = require('../src/models/ClinicalStandardWatch');

test('every catalogued rule has an implementation and an update policy', () => {
  assert.equal(new Set(standards.map(x => x.id)).size, standards.length);
  for (const row of standards) {
    assert.ok(row.implementation && ['source', 'manual'].includes(row.monitor));
    if (row.monitor === 'source') assert.match(row.sourceUrl, /^https:\/\//);
    assert.ok(row.origin && row.publisher && row.currentRule);
    if (row.evidence === 'missing') assert.equal(row.originalUrl, '');
    else assert.match(row.originalUrl, /^https:\/\//);
  }
});

test('manual source check builds a valid lease query without querying a remote source', async () => {
  const original = ClinicalStandardWatch.findOneAndUpdate;
  const filters = [];
  ClinicalStandardWatch.findOneAndUpdate = async filter => { filters.push(filter); return null };
  try {
    assert.equal((await checkOne(standards[0], { force: true })).outcome, 'not_due');
    assert.equal((await checkOne(standards[0])).outcome, 'not_due');
    assert.equal(filters[0].$and.length, 1);
    assert.equal(filters[1].$and.length, 2);
    assert.ok(filters[1].$and[1].$or[1].checkedAt.$lte < new Date(Date.now() - 89 * 24 * 60 * 60 * 1000));
  } finally { ClinicalStandardWatch.findOneAndUpdate = original }
});

test('source fingerprint ignores scripts but detects clinical text changes', async () => {
  const stable = 'Clinical version 2025 and categories. '.repeat(4);
  const a = canonicalContent(Buffer.from(`<html><script>time=1</script><main>${stable}</main></html>`), 'text/html');
  const b = canonicalContent(Buffer.from(`<html><script>time=2</script><main>${stable}</main></html>`), 'text/html');
  assert.equal(a.toString(), b.toString());
  assert.notEqual(a.toString(), canonicalContent(Buffer.from(`<main>${stable.replace('2025', '2026')}</main>`), 'text/html').toString());
  await assert.rejects(fetchFingerprint({ sourceUrl: 'https://example.com/standard' }, () => { throw new Error('network called'); }), /可信站点/);
});

test('ACR source may redirect only to its official asset path', async () => {
  const legacy = { sourceUrl: 'https://www.acr.org/-/media/ACR/Files/RADS/Lung-RADS/Lung-RADS-2022.pdf' };
  const asset = 'https://edge.sitecorecloud.io/acr-production/media/ACR/Files/RADS/Lung-RADS/Lung-RADS-2022.pdf';
  const fetchImpl = async url => url === legacy.sourceUrl
    ? new Response(null, { status: 302, headers: { location: asset } })
    : new Response('clinical content '.repeat(10), { status: 200, headers: { 'content-type': 'text/html' } });
  assert.match(await fetchFingerprint(legacy, fetchImpl), /^[a-f0-9]{64}$/);
  await assert.rejects(fetchFingerprint(legacy, async () => new Response(null, { status: 302, headers: { location: 'https://example.com/file.pdf' } })), /非可信站点/);
});
