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
