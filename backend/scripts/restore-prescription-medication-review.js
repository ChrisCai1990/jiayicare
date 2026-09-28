/* Restore only records altered by the erroneous duplicate-review migration.
 * Usage: node scripts/restore-prescription-medication-review.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Medication = require('../src/models/Medication');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const filter = {
    aiStatus: 'approved',
    sourceRecordKey: /^prescription_(report_review|review):/,
    reviewedByName: '处方审核',
    note: '已完成处方人工审核，取消重复用药核对。',
  };
  const count = await Medication.countDocuments(filter);
  if (!apply) console.log(JSON.stringify({ candidates: count, apply: false }));
  else {
    const result = await Medication.updateMany(filter, {
      $set: { aiStatus: 'pending', reviewedByName: '', reviewedAt: null, note: '依据已审核处方新增，待健康顾问确认。' },
    });
    console.log(JSON.stringify({ candidates: count, modified: result.modifiedCount, apply: true }));
  }
  await mongoose.disconnect();
}

main().catch(error => { console.error(error.message); process.exit(1); });
