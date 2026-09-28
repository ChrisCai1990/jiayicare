/* 将已完成处方人工审核后产生的重复“待核对用药”标记为已确认。
 * 仅匹配明确来源键，绝不触碰普通 AI 建议或手工新增记录。
 * 用法：node scripts/approve-reviewed-prescription-medications.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Medication = require('../src/models/Medication');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const filter = { aiStatus: 'pending', sourceRecordKey: /^prescription_(report_review|review):/ };
  const count = await Medication.countDocuments(filter);
  if (!apply) {
    console.log(JSON.stringify({ candidates: count, apply: false }));
  } else {
    const result = await Medication.updateMany(filter, {
      $set: { aiStatus: 'approved', reviewedByName: '处方审核', reviewedAt: new Date(), note: '已完成处方人工审核，取消重复用药核对。' },
    });
    console.log(JSON.stringify({ candidates: count, modified: result.modifiedCount, apply: true }));
  }
  await mongoose.disconnect();
}

main().catch(error => { console.error(error.message); process.exit(1); });
