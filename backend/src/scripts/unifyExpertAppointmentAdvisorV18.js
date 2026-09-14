require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await FollowUp.updateMany(
    { workflowKey: 'medical_proxy:appointment_review', status: { $in: ['planned', 'in_progress'] } },
    { $set: {
      theme: '专家约诊：健康顾问确认约诊建议 · 专家约诊服务',
      plannedContent: '请在完整约诊建议页面确认医院、院区、科室、专家、门诊类型、费用与保险及期望日期；原内容已自动带入，确认后转健管专员预约。',
    } },
  );
  console.log(`已统一 ${result.modifiedCount} 个健康顾问约诊建议任务`);
  await mongoose.disconnect();
}

run().catch(error => { console.error(error); process.exit(1); });
