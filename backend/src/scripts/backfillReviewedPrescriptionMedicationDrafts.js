/**
 * Recreate missing review drafts from legacy audited prescriptions whose rows
 * retained the default "create" action and have a dose and frequency.
 * These are unconfirmed candidates, not evidence of current use.
 * Run without arguments to preview; --apply --expected=N inserts exactly N.
 * No existing medication or prescription is modified.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MedicalReport = require('../models/MedicalReport');
const Medication = require('../models/Medication');

const text = value => String(value || '').trim();

function candidateFor(report, item, index) {
  if (item?.itemType !== 'medication' || item?.medicationAction !== 'create') return null;
  const name = text(item.genericName || item.name);
  const dosage = text(text(item.referenceRange).match(/每次\s*([^\s，。；;]+)/)?.[1]);
  const frequencyMatch = text(item.referenceRange).match(/每(?:天|日)\s*([^，。；;]+)/);
  const frequency = frequencyMatch ? `每天${text(frequencyMatch[1])}` : '';
  if (!name || !dosage || !frequency) return { incomplete: true };
  const instruction = `${item.findings || ''} ${item.sourceSection || ''}`;
  return {
    name, dosage, frequency,
    sourceRecordKey: `prescription_report_review:${report._id}:${index}:${name}:${dosage}:${frequency}`,
    brandName: text(item.brandName), specification: text(item.value),
    method: (instruction.match(/口服|外用|注射|含服|吸入/) || [])[0] || '口服',
    timing: (instruction.match(/餐前|餐后|餐中|早饭后|晚饭后|睡前/) || [])[0] || '',
    startDate: text(item.examDate || report.checkDate), purpose: text(item.diagnosis),
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const expectedArg = process.argv.find(arg => arg.startsWith('--expected='));
  const expected = expectedArg ? Number(expectedArg.split('=')[1]) : NaN;
  if (apply && (!Number.isInteger(expected) || expected < 0)) throw new Error('写入必须指定 --expected=N');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare');
  try {
    const reports = await MedicalReport.find({ documentCategory: 'prescription_order', audit_status: 'audited', clinicalReview: null,
      reportItems: { $elemMatch: { itemType: 'medication', medicationAction: 'create' } } })
      .select('_id user checkDate fileUrls reportItems').lean();
    const userIds = [...new Set(reports.map(report => String(report.user)))];
    const existing = await Medication.find({ user: { $in: userIds } })
      .select('user name stopped aiStatus sourceRecordKey').lean();
    const byUser = new Map();
    for (const medication of existing) {
      const user = String(medication.user);
      if (!byUser.has(user)) byUser.set(user, []);
      byUser.get(user).push(medication);
    }
    const stats = { auditedReportsWithCreate: reports.length, explicitRows: 0, incompleteRows: 0,
      alreadyLinked: 0, possibleDuplicate: 0, candidates: 0, inserted: 0 };
    const candidates = [];
    for (const report of reports) {
      for (const [index, item] of (report.reportItems || []).entries()) {
        if (item?.itemType !== 'medication' || item?.medicationAction !== 'create') continue;
        stats.explicitRows++;
        const candidate = candidateFor(report, item, index);
        if (candidate.incomplete) { stats.incompleteRows++; continue; }
        const medications = byUser.get(String(report.user)) || [];
        if (medications.some(medication => medication.sourceRecordKey === candidate.sourceRecordKey)) {
          stats.alreadyLinked++; continue;
        }
        if (medications.some(medication => text(medication.name) === candidate.name
          && !medication.stopped && medication.aiStatus !== 'rejected')
          || candidates.some(entry => String(entry.report.user) === String(report.user)
            && entry.candidate.name === candidate.name)) {
          stats.possibleDuplicate++; continue;
        }
        candidates.push({ report, candidate });
      }
    }
    stats.candidates = candidates.length;
    if (apply && stats.candidates !== expected) throw new Error(`候选数 ${stats.candidates} 与预期 ${expected} 不符，未写入`);
    if (apply) for (const { report, candidate } of candidates) {
      const result = await Medication.updateOne({ user: report.user, sourceRecordKey: candidate.sourceRecordKey },
        { $setOnInsert: {
          user: report.user, ...candidate, note: '依据已审核处方回填，待健康顾问核对当前服用情况。',
          imageUrls: report.fileUrls || [], active: false, stopped: false, createdByStaff: true,
          createdByName: '处方审核回填', aiStatus: 'pending', aiGeneratedBy: '已审核处方/医嘱', sourceType: 'manual',
        } }, { upsert: true });
      stats.inserted += result.upsertedCount || 0;
    }
    console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', ...stats }));
    if (apply && stats.inserted !== expected) throw new Error(`实际新增 ${stats.inserted} 与预期 ${expected} 不符，请核对并重跑预演`);
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { candidateFor };
