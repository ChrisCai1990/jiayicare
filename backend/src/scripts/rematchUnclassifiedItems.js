/**
 * 一次性修数据：对所有体检报告里 matchStatus='unclassified' 的检验项，用最新的
 * ProjectCategory 别名字典重新跑一遍归类匹配，命中的就更新 screeningKey 等字段。
 *
 * 背景：2026-07-21 发现"三碘甲腺原氨酸"（缺"状"字变体）、"天冬氨酸氨基转移酶"（缺"门"字变体）
 * 等常见检验单书写变体没被别名字典收录，导致AI正确提取了项目但归类失败，长期停留在
 * unclassified。已在字典里补上这些别名（甲状腺功能7项/肝功能两个节点），本脚本把历史上
 * 已经卡在 unclassified 状态的项目重新匹配一遍，不影响已经 matched 的项目。
 *
 * 用法：
 *   node src/scripts/rematchUnclassifiedItems.js            # 预演（dry-run，只打印不写库）
 *   node src/scripts/rematchUnclassifiedItems.js --apply     # 实际写库
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MedicalReport = require('../models/MedicalReport');
const { classifyItemsAsync } = require('../utils/screeningMatch');

const APPLY = process.argv.includes('--apply');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare';
  await mongoose.connect(uri);
  console.log(`[rematch] connected: ${uri}`);
  console.log(`[rematch] mode: ${APPLY ? 'APPLY (写库)' : 'DRY-RUN (仅预演)'}`);

  const reports = await MedicalReport.find({ 'reportItems.matchStatus': 'unclassified' });
  console.log(`[rematch] 含未归类项目的报告: ${reports.length} 份`);

  let touchedReports = 0, fixedItems = 0;

  for (const report of reports) {
    const items = report.reportItems || [];
    const hasUnclassified = items.some(it => it.matchStatus === 'unclassified');
    if (!hasUnclassified) continue;

    const reclassified = await classifyItemsAsync(items.map(it => it.toObject ? it.toObject() : it));

    let changed = false;
    const newItems = items.map((oldIt, idx) => {
      const newIt = reclassified[idx];
      if (oldIt.matchStatus === 'unclassified' && newIt.matchStatus === 'matched') {
        changed = true;
        console.log(`  [修复] 报告${report._id} "${oldIt.name}" → ${newIt.screeningKey}`);
        fixedItems++;
        return { ...(oldIt.toObject ? oldIt.toObject() : oldIt), ...newIt };
      }
      return oldIt;
    });

    if (changed) {
      touchedReports++;
      if (APPLY) {
        report.reportItems = newItems;
        await report.save();
      }
    }
  }

  console.log(`\n[rematch] 完成：检查报告 ${reports.length} 份，修复 ${touchedReports} 份报告共 ${fixedItems} 个项目`);
  if (!APPLY && fixedItems > 0) console.log('[rematch] 这是预演，未写库。确认无误后加 --apply 实际执行。');

  await mongoose.disconnect();
}

main().catch(err => { console.error('[rematch] 失败:', err); process.exit(1); });
