/** 仅重匹配本次已确认别名对应的历史待归类项。默认预演，--apply 才写库。 */
require('dotenv').config();
const mongoose = require('mongoose');
const MedicalReport = require('../models/MedicalReport');
const { classifyItemsAsync, norm } = require('../utils/screeningMatch');
const { REPORT_CLASSIFICATION_ALIASES } = require('../utils/reportClassificationAliases');

const APPLY = process.argv.includes('--apply');
const targetNames = new Set(Object.values(REPORT_CLASSIFICATION_ALIASES).flat().map(norm));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare');
  const reports = await MedicalReport.find({ 'reportItems.matchStatus': 'unclassified' });
  let touchedReports = 0;
  let fixedItems = 0;
  for (const report of reports) {
    const original = report.reportItems || [];
    const targetIndexes = [];
    const targets = [];
    original.forEach((item, index) => {
      if (item.matchStatus === 'unclassified' && targetNames.has(norm(item.name))) {
        targetIndexes.push(index);
        targets.push(item.toObject ? item.toObject() : item);
      }
    });
    if (!targets.length) continue;
    const classified = await classifyItemsAsync(targets);
    let changed = false;
    const setFields = {};
    targetIndexes.forEach((originalIndex, targetIndex) => {
      const next = classified[targetIndex];
      if (next.matchStatus !== 'matched') return;
      changed = true;
      fixedItems++;
      console.log(`[修复] 报告${report._id} “${original[originalIndex].name}” → ${next.screeningKey}`);
      for (const field of ['screeningKeys', 'screeningKey', 'screeningCategory', 'screeningParent', 'matchStatus', 'matchConfidence']) {
        setFields[`reportItems.${originalIndex}.${field}`] = next[field];
      }
    });
    if (changed) {
      touchedReports++;
      // 只更新归类字段，兼容历史报告中已不符合当前Schema枚举的旧条目，不触发整份报告校验。
      if (APPLY) await MedicalReport.collection.updateOne({ _id: report._id }, { $set: setFields });
    }
  }
  console.log(`[targeted-rematch] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} reports=${touchedReports} items=${fixedItems}`);
  await mongoose.disconnect();
}

main().catch(error => { console.error('[targeted-rematch] failed:', error); process.exit(1); });
