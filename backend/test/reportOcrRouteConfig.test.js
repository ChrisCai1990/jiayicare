const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('staff OCR routes load the shared OCR policy constants', () => {
  assert.doesNotThrow(() => require('../src/routes/staff'));
  const { OCR_POLICY_VERSION, OCR_V2_EXTRACTION_CONTRACT } = require('../src/config/ocrPolicy');
  assert.equal(OCR_POLICY_VERSION, 'v2.0');
  assert.ok(OCR_V2_EXTRACTION_CONTRACT);
});

test('home monitoring and functional medicine are not blocked from OCR routes', () => {
  const staffRoute = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const userRoute = fs.readFileSync(path.join(__dirname, '../src/routes/reports.js'), 'utf8');

  assert.doesNotMatch(staffRoute, /report\.type === 'home_monitor'[\s\S]{0,300}skipAi/);
  assert.doesNotMatch(staffRoute, /isFunctionalMedicineL1\(report\.screeningL1\)/);
  assert.doesNotMatch(userRoute, /report\.type === 'home_monitor' \|\| report\.type === 'functional'/);
  assert.doesNotMatch(userRoute, /isFunctionalMedicineL1\(report\.screeningL1\)/);
});

test('manual reclassification only processes unclassified report items', () => {
  const staffRoute = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const routeStart = staffRoute.indexOf("router.post('/patients/:id/reports/:rid/reclassify'");
  const routeEnd = staffRoute.indexOf("// ── 问卷", routeStart);
  const routeSource = staffRoute.slice(routeStart, routeEnd);

  assert.match(routeSource, /if \(!hasConfirmedClassification\)/);
  assert.doesNotMatch(routeSource, /structuralCorrection/);
  assert.match(routeSource, /processedCount: pendingItems\.length/);
});

test('OCR review classification editor is not hidden in a details disclosure', () => {
  const patientPage = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
  const marker = '专项筛查归类（提交前必填）';
  const markerAt = patientPage.indexOf(marker);
  const nearby = patientPage.slice(Math.max(0, markerAt - 250), markerAt + 450);
  assert.ok(markerAt >= 0);
  assert.doesNotMatch(nearby, /<details|<summary/);
  assert.match(nearby, /classifyCell\(it, i\)/);
});

test('Mingzhou P7 missing weight blocks draft persistence after one local retry', () => {
  const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  assert.match(routeSource, /renderSinglePageCrop\(pdfBuf, 7/);
  assert.match(routeSource, /selectOriginalWeight\(allItems\.filter\(item => item\._page === 7\)\)/);
  assert.match(routeSource, /stage: 'incomplete'/);
  assert.match(routeSource, /本次结果未写入审核草稿/);
});

test('all PDF OCR paths have a finite post-primary retry budget', () => {
  const staffRoute = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');

  assert.match(staffRoute, /const retryBudgetMs = \(useShaoyifuTemplate \|\| useZheyiTemplate \|\| useMingzhouTemplate\) \? 90_000 : 60_000/);
  assert.match(staffRoute, /const retryDeadline = Date\.now\(\) \+ retryBudgetMs/);
  assert.doesNotMatch(staffRoute, /useTextLayerPrimary \? Date\.now\(\) \+ 90_000 : Number\.POSITIVE_INFINITY/);
  assert.match(staffRoute, /if \(timedOut\) break/);
});

test('expired report preview credentials refresh without closing OCR review', () => {
  const preview = fs.readFileSync(path.join(__dirname, '../../staff/src/components/PdfPagePreview.jsx'), 'utf8');
  const patientPage = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
  assert.match(preview, /onAuthExpired/);
  assert.match(preview, /401\|403/);
  assert.match(patientPage, /onAuthExpired=\{refreshOCRPreviewToken\}/);
  assert.match(patientPage, /staffAPI\.getReport\(reportId\)/);
});
