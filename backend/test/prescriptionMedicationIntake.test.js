const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const start = source.indexOf("router.post('/patients/:id/medications',");
const end = source.indexOf('\n});', start) + 4;

async function submit({ report = { _id: 'report-id', fileUrls: ['prescription.png'] }, existing = [], assignedDoctor = 'doctor', sourceReportId = 'report-id' } = {}) {
  let handler;
  let created = null;
  let reportFilter = null;
  const query = value => ({ select: () => ({ lean: async () => value }) });
  vm.runInNewContext(source.slice(start, end), {
    router: { post: (_path, _auth, callback) => { handler = callback; } },
    staffAuth: () => {},
    mongoose: { isValidObjectId: () => true },
    NEEDS_REVIEW_ROLES: ['healthManager', 'medicalAssistant'],
    User: { findById: () => query({ tenantId: 'tenant', assignedFamilyDoctor: assignedDoctor }) },
    MedicalReport: { findOne: filter => { reportFilter = filter; return query(report); } },
    Medication: {
      find: () => query(existing), exists: async () => false,
      create: async record => { created = record; return record; },
    },
    require: name => name.endsWith('/annualPlanPreparationTasks') ? { completeAnnualPreparationTask: async () => {} }
      : name.endsWith('/medicationAttachmentStorage') ? { normalizeMedicationAttachments: async urls => urls }
        : null,
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({ params: { id: 'patient' }, staff: { role: 'familyDoctor', _id: 'doctor', tenantId: 'tenant', name: 'Reviewer' },
    body: { sourceReportId, name: '  Example Drug  ', dosage: ' 5mg ', frequency: ' daily ' } }, res);
  return { res, created, reportFilter };
}

test('an audited prescription creates an inactive draft for advisor review with source evidence', async () => {
  const { res, created, reportFilter } = await submit();
  assert.equal(res.code, 201);
  assert.equal(reportFilter.user, 'patient');
  assert.equal(reportFilter.documentCategory, 'prescription_order');
  assert.equal(reportFilter.audit_status, 'audited');
  assert.equal(created.name, 'Example Drug');
  assert.equal(created.aiStatus, 'pending');
  assert.equal(created.active, false);
  assert.equal(created.sourceRecordKey, 'prescription_manual:report-id:example drug');
  assert.deepEqual(Array.from(created.imageUrls), ['prescription.png']);
});

test('a duplicate current medicine is not created from a prescription', async () => {
  const { res, created } = await submit({ existing: [{ name: 'example drug', aiStatus: 'approved' }] });
  assert.equal(res.code, 409);
  assert.equal(created, null);
});

test('an unrelated or unaudited prescription cannot create a medication draft', async () => {
  const { res, created } = await submit({ report: null });
  assert.equal(res.code, 409);
  assert.equal(created, null);
});

test('only the assigned advisor can submit a prescription draft as advisor', async () => {
  const { res, created } = await submit({ assignedDoctor: 'someone-else' });
  assert.equal(res.code, 403);
  assert.equal(created, null);
});

test('advisor approval activates a prescription draft after review', async () => {
  const reviewStart = source.indexOf("router.patch('/patients/:id/medications/:medId/review',");
  const reviewEnd = source.indexOf('\n});', reviewStart) + 4;
  let handler;
  const draft = { aiStatus: 'pending', active: false, staffId: 'manager', sourceRecordKey: 'prescription_manual:report-id:example drug', save: async () => {} };
  vm.runInNewContext(source.slice(reviewStart, reviewEnd), {
    router: { patch: (_path, _auth, callback) => { handler = callback; } }, staffAuth: () => {},
    Medication: { findOne: async () => draft },
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({ params: { id: 'patient', medId: 'med' }, staff: { role: 'familyDoctor', _id: 'doctor', name: 'Reviewer' }, body: { action: 'approve' } }, res);
  assert.equal(res.code, 200);
  assert.equal(draft.aiStatus, 'approved');
  assert.equal(draft.active, true);
  assert.equal(draft.reviewedByName, 'Reviewer');
});
