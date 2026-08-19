const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('patient creation route loads the service package model for brand validation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const modelImport = source.indexOf("require('../models/ServicePackage')");
  const createRoute = source.indexOf("router.post('/patients'");

  assert.ok(modelImport >= 0);
  assert.ok(createRoute >= 0);
  assert.ok(modelImport < createRoute, 'ServicePackage must be available to patient creation');
});
