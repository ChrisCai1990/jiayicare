/**
 * 将已审核报告的检查机构统一为审核后的报告级 hospital/institution，
 * 清理历史 OCR 在项目级写入的翻译、英文变体或错误名称。
 * 默认仅预览；正式部署窗口使用 --apply。
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MedicalReport = require('../src/models/MedicalReport');

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const reports = await MedicalReport.find({ audit_status: 'audited' });
  let affectedReports = 0;
  let affectedItems = 0;

  for (const report of reports) {
    const canonical = String(report.hospital || report.institution || '').trim();
    if (!canonical) continue;
    let changed = report.hospital !== canonical || report.institution !== canonical;
    for (const item of report.reportItems || []) {
      if (item.institution !== canonical) {
        affectedItems++;
        changed = true;
        if (apply) item.institution = canonical;
      }
    }
    if (changed) {
      affectedReports++;
      if (apply) {
        report.hospital = canonical;
        report.institution = canonical;
        await report.save();
      }
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', affectedReports, affectedItems }, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
