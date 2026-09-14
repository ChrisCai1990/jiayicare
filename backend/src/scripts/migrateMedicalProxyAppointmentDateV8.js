/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const copied = await FollowUp.updateMany(
    { sourceType: 'order', workflowKey: 'medical_proxy:booking', 'formData.expertClinicDate': { $type: 'string', $ne: '' }, $or: [{ 'formData.appointmentDate': { $exists: false } }, { 'formData.appointmentDate': { $in: ['', null] } }] },
    [{ $set: { 'formData.appointmentDate': '$formData.expertClinicDate' } }],
  );
  const cleaned = await FollowUp.updateMany(
    { sourceType: 'order', workflowKey: 'medical_proxy:booking', 'formData.expertClinicDate': { $exists: true } },
    { $unset: { 'formData.expertClinicDate': 1 }, $set: { plannedContent: '依据健康顾问方案预约专家门诊；记录客户期望日期与专家实际出诊及约诊日期，日期不一致时记录沟通确认结果。' } },
  );
  console.log(JSON.stringify({ appointmentDatesCopied: copied.modifiedCount || 0, obsoleteDateFieldsRemoved: cleaned.modifiedCount || 0 }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
