const { createHash } = require('node:crypto');

function medicationDrafts(patient, actor) {
  const section = patient.coreHealthArchive?.medication;
  if (section?.presence !== 'present') return { drafts: [], incomplete: [] };
  const drafts = [], incomplete = [];
  for (const row of section.records || []) {
    if (!/药物|药品/.test(row.kind || '')) continue;
    if (!row.id || !row.name || !row.dosage || !row.frequency) {
      incomplete.push(row.name || '未命名条目');
      continue;
    }
    drafts.push({
      user: patient._id, archiveRecordId: row.id, name: row.name,
      dosage: row.dosage, frequency: row.frequency, purpose: row.purpose || '',
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(row.startedAt || '') ? row.startedAt : '',
      note: [row.startedAt && !/^\d{4}-\d{2}-\d{2}$/.test(row.startedAt) ? `建档记录的开始时间：${row.startedAt}` : '',
        row.baselineAt ? `建档时间：${row.baselineAt}` : '', row.source ? `建档信息来源：${row.source}` : '', row.note || ''].filter(Boolean).join('；'),
      createdByStaff: true, staffId: actor._id, createdByName: actor.name || '',
      aiStatus: 'pending', active: false, sourceType: 'manual', sourceRecordKey: `initial_archive:${row.id}`,
    });
  }
  return { drafts, incomplete };
}

async function importArchiveMedications(patient, actor, Medication = require('../models/Medication')) {
  const { drafts, incomplete } = medicationDrafts(patient, actor);
  let created = 0, existing = 0;
  for (const draft of drafts) {
    // MongoDB's built-in _id index makes concurrent retries safe without a schema migration.
    const id = createHash('sha256').update(`initial_archive:${patient._id}:${draft.archiveRecordId}`).digest('hex').slice(0, 24);
    const linked = await Medication.exists({ user: patient._id, archiveRecordId: draft.archiveRecordId });
    if (linked) { existing++; continue; }
    // A manually entered copy of the same current drug should remain the single review item.
    const matching = await Medication.exists({ user: patient._id, name: draft.name,
      dosage: draft.dosage, frequency: draft.frequency, stopped: false, active: { $ne: false } });
    if (matching) { existing++; continue; }
    try {
      const result = await Medication.updateOne({ _id: id, user: patient._id },
        { $setOnInsert: draft }, { upsert: true });
      if (result.upsertedCount) created++; else existing++;
    } catch (error) {
      if (error.code === 11000) existing++; else throw error;
    }
  }
  return { created, existing, incomplete };
}

module.exports = { medicationDrafts, importArchiveMedications };
