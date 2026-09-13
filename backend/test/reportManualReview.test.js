const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const MedicalReport = require('../src/models/MedicalReport');
const { isManualOnlyReport } = require('../src/utils/reportManualReview');

test('all upload sources enter manual review without invoking OCR', async () => {
  for (const fields of [{ type: 'functional' }, { type: 'other', documentCategory: 'functional_medicine' }]) {
    const report = new MedicalReport({ user: '507f1f77bcf86cd799439011', title: 'test', ...fields });
    await report.validate();
    assert.equal(report.aiStatus, 'pending');
    assert.equal(report.parseJob.status, 'skipped');
    assert.notEqual(report.audit_status, 'audited');
  }
});
test('ordinary reports still await parsing, and completed/rejected records are preserved', async () => {
  const normal = new MedicalReport({ user: '507f1f77bcf86cd799439011', title: 'test', type: 'annual' });
  await normal.validate();
  assert.equal(normal.aiStatus, 'none');
  for (const [audit_status, aiStatus] of [['audited', 'reviewed'], ['rejected', 'rejected']]) {
    const r = new MedicalReport({ user: '507f1f77bcf86cd799439011', title: 'test', type: 'functional', audit_status, aiStatus });
    await r.validate();
    assert.equal(r.aiStatus, aiStatus);
  }
});
test('historical failed reports retain extracted items when moved to manual review', async () => {
  const r = new MedicalReport({ user: '507f1f77bcf86cd799439011', title: 'test', type: 'functional', aiStatus: 'failed', reportItems: [{ name: 'existing', value: '7' }] });
  await r.validate();
  assert.equal(r.aiStatus, 'pending');
  assert.equal(r.reportItems[0].value, '7');
});
test('frontend and backend agree on canonical classification across legacy status values', async () => {
  const ui = await import(pathToFileURL(path.resolve(__dirname, '../../staff/src/utils/reportManualReview.js')));
  for (const type of ['functional', 'home_monitor', 'annual', 'other']) {
    for (const documentCategory of ['', 'physical_exam', 'functional_medicine']) {
      for (const aiStatus of ['none', 'pending', 'failed', 'reviewed']) {
        const r = { type, documentCategory, aiStatus };
        assert.equal(ui.isManualOnlyReport(r), isManualOnlyReport(r));
      }
    }
  }
});

test('workbench filters route legacy functional reports to review without reopening closed work', () => {
  const fs = require('node:fs');
  const sift = require('sift').default;
  const { manualOnlyReportFilter } = require('../src/utils/reportManualReview');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/staff.js'), 'utf8');
  const section = source.slice(source.indexOf("router.get('/ai-todos'"));
  const filter = name => Function('manualOnlyReportFilter', 'myPatientIds', 'return (' + section.match(new RegExp('const ' + name + ' = (\\{[\\s\\S]*?\\n      \\});'))[1] + ')')(manualOnlyReportFilter, ['owner']);
  const parse = sift(filter('parseFilter'));
  const review = sift(filter('reportFilter'));
  for (const aiStatus of ['none', 'failed', 'pending']) {
    const report = { type: 'functional', user: 'owner', aiStatus, audit_status: 'unaudited', fileUrl: 'test.pdf' };
    assert.equal(parse(report), false);
    assert.equal(review(report), true);
    assert.equal(review({ ...report, user: 'another' }), false);
    for (const audit_status of ['audited', 'rejected']) assert.equal(review({ ...report, audit_status }), false);
  }
  assert.equal(parse({ type: 'annual', user: 'owner', aiStatus: 'none', fileUrl: 'test.pdf' }), true);
});

test('single-page supplement rejects manual-only reports before claiming a job', async () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/staff.js'), 'utf8');
  const start = source.indexOf("router.post('/medical-reports/:id/parse-page'");
  const route = source.slice(start, source.indexOf('\n});', start) + 4);
  let handler;
  Function('router', 'staffAuth', 'require', 'isManualOnlyReport', 'manualOnlyReportMessage', route)(
    { post: (...args) => { handler = args.at(-1); } }, () => {},
    name => name.includes('MedicalReport') ? { findById: async () => ({ type: 'functional' }), findOneAndUpdate: () => { throw new Error('must not claim an AI job'); } } : {},
    isManualOnlyReport, () => 'manual review only'
  );
  const result = {};
  const res = { status: code => { result.status = code; return res; }, json: body => { result.body = body; return res; } };
  await handler({ params: { id: 'test' }, body: { pageNum: 1 } }, res);
  assert.equal(result.status, 400);
  assert.equal(result.body.skipAi, true);
});
