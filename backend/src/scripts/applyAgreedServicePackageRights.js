/* eslint-disable no-console */
// Applies only confirmed, non-counted rights. Marketplace service counts, shared
// pools and currently configured phase/review cadence are deliberately preserved
// for Admin review.
require('dotenv').config();
const mongoose = require('mongoose');
const ServicePackage = require('../models/ServicePackage');

const RIGHTS = {
  healthArchiveConcierge: true,
  healthConsultation: true,
  medicalPlanning: true,
  expertAppointment: true,
  reportInterpretation: true,
};

const PATCHES = {
  // 365 has no trend/assessment/AI analysis. It is an archive-concierge and
  // consumption-membership identity only.
  '365健康会员': {
    entitlements: { healthArchiveConcierge: true },
    configuration: { deliveryMode: 'digital', includes365: true, familySharing: false, membershipTier: 'consumer365', reviewMode: 'exception', noResponseRule: '连续3次（隔日）未配合转人工' },
  },
  // 轻享保留其已配置的“单次报告/营养评估”商城权益；不扩大为不限次专家服务。
  '轻享健康计划': {
    entitlements: { healthArchiveConcierge: true },
    configuration: { deliveryMode: 'digital', includes365: true, familySharing: false, membershipTier: 'annual', reviewMode: 'exception', noResponseRule: '连续3次（隔日）未配合转人工' },
  },
  '健康预防计划': {
    entitlements: { aiHealthAnalysis: true, phaseAssessment: true, monthlyServiceReview: false, ...RIGHTS },
    configuration: { deliveryMode: 'team', includes365: true, familySharing: true, membershipTier: 'annual', reviewMode: 'exception', noResponseRule: '连续3次（隔日）未配合转人工' },
  },
  '个人健康护航计划': {
    entitlements: { aiHealthAnalysis: true, phaseAssessment: true, monthlyServiceReview: true, ...RIGHTS },
    configuration: { deliveryMode: 'team', includes365: true, familySharing: true, membershipTier: 'annual', reviewMode: 'exception', noResponseRule: '连续3次（隔日）未配合转人工' },
  },
  '健康维稳计划': {
    entitlements: { aiHealthAnalysis: true, phaseAssessment: true, monthlyServiceReview: true, ...RIGHTS },
    configuration: { deliveryMode: 'human', includes365: true, familySharing: true, membershipTier: 'annual', reviewMode: 'required', noResponseRule: '连续3次（隔日）未配合转人工' },
  },
  '健康重塑计划': {
    entitlements: { aiHealthAnalysis: true, phaseAssessment: true, monthlyServiceReview: true, ...RIGHTS },
    configuration: { deliveryMode: 'human', includes365: true, familySharing: true, membershipTier: 'annual', reviewMode: 'required', noResponseRule: '连续3次（隔日）未配合转人工' },
  },
  // 当前为空白方案，只写高配人工年度服务的确定项；服务次数、共享池和
  // 阶段节奏由运营在 Admin 复核后单独补充。
  '健康年轻态计划': {
    entitlements: { aiHealthAnalysis: true, phaseAssessment: true, monthlyServiceReview: true, ...RIGHTS },
    configuration: { deliveryMode: 'human', includes365: true, familySharing: true, membershipTier: 'annual', reviewMode: 'required', noResponseRule: '连续3次（隔日）未配合转人工' },
  },
};

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const results = [];
  for (const [name, patch] of Object.entries(PATCHES)) {
    const row = await ServicePackage.findOne({ name });
    if (!row) { results.push({ name, status: 'missing' }); continue; }
    row.entitlements = { ...(row.entitlements?.toObject?.() || row.entitlements || {}), ...patch.entitlements };
    row.configuration = { ...(row.configuration || {}), ...patch.configuration };
    if (process.argv.includes('--apply')) await row.save();
    results.push({ name, status: process.argv.includes('--apply') ? 'updated' : 'preview', entitlements: row.entitlements, configuration: row.configuration });
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
