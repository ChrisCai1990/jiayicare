/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const MedicalReport = require('../src/models/MedicalReport');

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ name: '陈建微' }).select('_id name phone').lean();
  if (!user) throw new Error('未找到用户：陈建微');

  const reports = await MedicalReport.find({
    user: user._id,
    $or: [
      { checkDate: '2025-11-13' },
      { date: '2025-11-13' },
    ],
    title: /25[\s-]*羟基维生素D/i,
  }).select('title checkDate date status audit_status familyDoctorViewedAt createdAt').lean();

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    user: { id: user._id, name: user.name, phone: user.phone },
    candidates: reports,
  }, null, 2));

  if (!APPLY) return;
  if (reports.length !== 1) {
    throw new Error(`候选报告数量为 ${reports.length}，为避免误改已停止；请先人工确认数据`);
  }
  const report = reports[0];
  if (report.audit_status !== 'audited') {
    throw new Error('该报告尚未完成医护审核，不能自动改为已解读');
  }
  await MedicalReport.updateOne({ _id: report._id, status: 'pending' }, { $set: { status: 'analyzed' } });
  console.log(`已修复报告 ${report._id}：待解读 → 已解读`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
