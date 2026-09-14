/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const PlanTemplate = require('../models/PlanTemplate');

const standardSteps = '健康规划师确认诉求并指导客户上传、选择本次资料\n健管专员审核资料\n健康顾问确认医院、科室、专家、代诊目标和交流内容\n健康规划师复核并预指派就医专员\n健管专员完成专家门诊预约并核对客户期望日期\n就医专员完成代诊、上传病历并记录医生反馈\n健康顾问确认后续随访计划；健康规划师督办至代诊结束';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const products = await Product.collection.updateMany({ name: /医疗代诊/ }, { $set: {
    'serviceWorkflow.key': 'medical_proxy',
    'serviceWorkflow.followUpPlanId': null,
    'serviceWorkflow.followUpPlanIds': [],
    'serviceWorkflow.questionnaireId': null,
    'serviceWorkflow.modules': [],
    'serviceWorkflow.notes': '商城下单或医护端推送商品后，由健康规划师确认服务信息；岗位任务由医疗代诊订单流程统一生成。',
  } });
  const templates = await PlanTemplate.collection.updateMany({ type: 'medical_assist', name: /医疗代诊/ }, { $set: {
    'content.standardSteps': standardSteps,
    'content.completionStandard': '就医专员完成代诊并上传病历，医生意见归档；复查建议形成待健康顾问确认的随访计划，健康规划师督办至代诊结束。',
  } });
  console.log(JSON.stringify({ productsUpdated: products.modifiedCount || 0, templatesUpdated: templates.modifiedCount || 0 }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
