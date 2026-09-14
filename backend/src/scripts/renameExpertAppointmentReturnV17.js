require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await FollowUp.updateMany(
    { workflowKey: 'medical_proxy:appointment_review', status: { $in: ['planned', 'in_progress'] } },
    {
      $set: {
        theme: '专家约诊：回退健康顾问完善约诊类目 · 专家约诊服务',
        plannedContent: '原约诊内容和日期已保留。请完善新增的院区、门诊类型、费用与高端险及结算方式，提交后重新流转给健管专员预约。',
      },
    },
  );
  console.log(`已更新 ${result.modifiedCount} 个专家约诊回退任务`);
  await mongoose.disconnect();
}

run().catch(error => { console.error(error); process.exit(1); });
