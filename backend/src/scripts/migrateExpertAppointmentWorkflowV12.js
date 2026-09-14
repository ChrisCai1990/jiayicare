/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const PlanTemplate = require('../models/PlanTemplate');
const Order = require('../models/Order');
const FollowUp = require('../models/FollowUp');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const content = {
    serviceDomain: 'medical_assist',
    assistanceType: 'expert_appointment',
    serviceMode: 'remote',
    applicableScenario: '客户已明确医院、科室或专家，需要协助完成专家门诊预约。',
    standardSteps: '健康顾问确认医院、科室、专家和期望日期区间\n健管专员完成专家门诊预约并记录实际日期时间\n系统向客户发送预约结果并结束服务',
    requiredMaterials: '客户身份信息、就诊人信息，以及医院预约要求所需的必要资料。',
    completionStandard: '预约日期和时间已确认，预约信息已通知客户。',
    optionalLogistics: '',
    riskNotes: '仅提供预约协调；涉及诊疗判断时由医生负责。',
    requiresDoctorConfirm: true,
    requiresExecutor: true,
    requiresSupervisor: false,
  };
  const template = await PlanTemplate.findOneAndUpdate(
    { tenantId: null, type: 'medical_assist', name: '专家约诊服务' },
    { $set: { status: 'active', clientBrand: '', clientBrands: [], content } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const completedBookings = await FollowUp.find({
    workflowKey: 'medical_proxy:booking', status: 'completed', sourceOrderId: { $ne: null },
  }).select('sourceOrderId completedAt').lean();
  let closedOrders = 0;
  for (const booking of completedBookings) {
    const result = await Order.updateOne(
      { _id: booking.sourceOrderId, serviceName: /专家约诊/, status: { $ne: 'completed' } },
      { $set: { status: 'completed', tradeStatus: 'completed', completedAt: booking.completedAt || new Date() } },
    );
    closedOrders += result.modifiedCount || 0;
  }
  console.log(JSON.stringify({ templateId: String(template._id), closedOrders }));
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
