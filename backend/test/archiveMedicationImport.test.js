const test = require('node:test');
const assert = require('node:assert/strict');
const { medicationDrafts, importArchiveMedications } = require('../src/utils/archiveMedicationImport');

test('reviewed archive drugs become inactive advisor drafts with source and stable identity', () => {
  const patient = { _id: 'patient', coreHealthArchive: { medication: { presence: 'present', records: [
    { id: 'drug-1', name: '赛治', kind: '药物', dosage: '10mg*2粒', frequency: '每日早上1次', purpose: '抗甲亢', startedAt: '2026.10.24', baselineAt: '2026.11.2', source: '人工核实', note: '服用当日头晕' },
    { id: 'supplement-1', name: '维生素', kind: '营养补充剂', dosage: '1粒', frequency: '每日1次' },
    { id: 'drug-2', name: '普萘洛尔片', kind: '药物', dosage: '', frequency: '每日2次' },
  ] } } };
  const result = medicationDrafts(patient, { _id: 'manager', name: '健管专员' });
  assert.equal(result.drafts.length, 1);
  assert.deepEqual(result.incomplete, ['普萘洛尔片']);
  assert.equal(result.drafts[0].archiveRecordId, 'drug-1');
  assert.equal(result.drafts[0].aiStatus, 'pending');
  assert.equal(result.drafts[0].active, false);
  assert.equal(result.drafts[0].startDate, '');
  assert.match(result.drafts[0].note, /2026\.10\.24/);
  assert.match(result.drafts[0].note, /人工核实/);
});

test('repeating the archive import does not add another advisor review item', async () => {
  const patient = { _id: 'patient', coreHealthArchive: { medication: { presence: 'present', records: [
    { id: 'drug-1', name: '赛治', kind: '药物', dosage: '10mg', frequency: '每日1次' },
  ] } } };
  const rows = [];
  const Medication = {
    async exists(filter) { return rows.some(row => Object.entries(filter).every(([key, value]) => key === 'active' ? row.active !== false : row[key] === value)); },
    async updateOne(filter, update) {
      if (rows.some(row => row.archiveRecordId === filter.archiveRecordId)) return { upsertedCount: 0 };
      rows.push(update.$setOnInsert);
      return { upsertedCount: 1 };
    },
  };
  assert.equal((await importArchiveMedications(patient, { _id: 'manager' }, Medication)).created, 1);
  assert.equal((await importArchiveMedications(patient, { _id: 'manager' }, Medication)).created, 0);
  assert.equal(rows.length, 1);
});
