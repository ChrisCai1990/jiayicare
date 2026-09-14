require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await FollowUp.updateMany(
    { workflowKey: 'medical_proxy:appointment_review', status: { $in: ['planned', 'in_progress'] } },
    {
      $set: {
        theme: '专家约诊：健康顾问补充约诊需求 · 专家约诊服务',
        plannedContent: '请补充医院、院区、科室、专家、门诊类型、费用与保险及期望日期区间，原预约记录将保留；提交后交给健管专员重新预约。',
      },
    },
  );
  console.log(`已更新 ${result.modifiedCount} 个专家约诊补充需求任务`);
  await mongoose.disconnect();
}

run().catch(error => { console.error(error); process.exit(1); });
