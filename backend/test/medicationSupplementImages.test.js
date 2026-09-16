const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const medicationModel = fs.readFileSync(path.join(__dirname, '../src/models/Medication.js'), 'utf8');
const supplementModel = fs.readFileSync(path.join(__dirname, '../src/models/Supplement.js'), 'utf8');

test('medication and supplement records persist image attachments', () => {
  assert.match(medicationModel, /imageUrls:\s*\[\{ type: String \}\]/);
  assert.match(supplementModel, /imageUrls:\s*\[\{ type: String \}\]/);

  const medicationCreate = routeSource.slice(
    routeSource.indexOf("router.post('/patients/:id/medications'"),
    routeSource.indexOf("router.put('/patients/:id/medications/:medId/reminder'"),
  );
  const medicationUpdate = routeSource.slice(
    routeSource.indexOf("router.patch('/patients/:id/medications/:medId'"),
    routeSource.indexOf("router.delete('/patients/:id/medications/:medId'"),
  );
  const supplementCreate = routeSource.slice(
    routeSource.indexOf("router.post('/patients/:id/supplements'"),
    routeSource.indexOf("router.patch('/patients/:id/supplements/:supId'"),
  );
  const supplementUpdate = routeSource.slice(
    routeSource.indexOf("router.patch('/patients/:id/supplements/:supId'"),
    routeSource.indexOf("router.delete('/patients/:id/supplements/:supId'"),
  );

  for (const source of [medicationCreate, medicationUpdate, supplementCreate, supplementUpdate]) {
    assert.match(source, /imageUrls/);
    assert.match(source, /slice\(0, 6\)/);
  }
});
