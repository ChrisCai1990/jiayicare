const test = require('node:test');
const assert = require('node:assert/strict');
const { createReportUploadJob, getReportUploadJob } = require('../src/utils/reportUploadJobs');

test('upload job responds before storage completes and only owner can poll result', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const id = createReportUploadJob('owner', { buffer: Buffer.from('file'), mimetype: 'application/pdf', size: 4 }, () => pending);
  assert.deepEqual(getReportUploadJob(id, 'owner'), { state: 'processing' });
  assert.equal(getReportUploadJob(id, 'other'), null);
  finish({ key: 'reports/example.pdf', size: 4 });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(getReportUploadJob(id, 'owner'), { state: 'done', result: { key: 'reports/example.pdf', size: 4 } });
});
