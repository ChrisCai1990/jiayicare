/* eslint-disable no-console */
// 将已核对的地芯企业合同接入“企业健康护航计划”。仅覆盖历史上已经标记
// 为该服务包的成员；未配置成员及其他企业合同一律不推断、不改写。
require('dotenv').config();
const mongoose = require('mongoose');
const Enterprise = require('../models/Enterprise');
const ServicePackage = require('../models/ServicePackage');
const User = require('../models/User');
const { grantEnterprisePackageEntitlement } = require('../utils/packageEntitlements');

const ENTERPRISE_NAME = '杭州地芯科技有限公司';
const PACKAGE_NAME = '企业健康护航计划';

const BASE_ENTITLEMENTS = {
  aiHealthAnalysis: true,
  phaseAssessment: false,
  monthlyServiceReview: false,
  healthArchiveConcierge: true,
  healthConsultation: true,
  medicalPlanning: true,
  expertAppointment: true,
  reportInterpretation: true,
};

const BASE_CONFIGURATION = {
  deliveryMode: 'team',
  includes365: true,
  // 企业合同的家属由企业单独关联，不因员工身份自动扩展给其他家庭成员。
  familySharing: false,
  membershipTier: 'enterprise',
  reviewMode: 'exception',
  noResponseRule: '连续3次（隔日）未配合转人工',
  phaseAssessmentFrequency: '',
  monthlyReviewStartMonth: 1,
  // 体检、牙科、运动、心理等企业共用或分人群项目，继续在企业合同/HR数据中
  // 维护；不擅自变成每位成员都有的商城次数权益。
  serviceEntitlements: [],
  sharedEntitlementPools: [],
};

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const [enterprise, servicePackage] = await Promise.all([
    Enterprise.findOne({ name: ENTERPRISE_NAME }),
    ServicePackage.findOne({ name: PACKAGE_NAME, clientBrand: 'jiayiguanjia' }),
  ]);
  if (!enterprise) throw new Error(`企业不存在：${ENTERPRISE_NAME}`);
  if (!servicePackage) throw new Error(`服务包不存在：${PACKAGE_NAME}`);
  const members = await User.find({ enterpriseId: enterprise._id, servicePackage: PACKAGE_NAME }).select('_id name').lean();
  const preview = {
    enterprise: enterprise.name,
    contract: [enterprise.contractStartAt, enterprise.contractEndAt],
    servicePackage: servicePackage.name,
    matchedExistingMembers: members.map(item => ({ id: String(item._id), name: item.name || '' })),
  };
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ mode: 'preview', ...preview }, null, 2)); return; }

  servicePackage.entitlements = { ...(servicePackage.entitlements?.toObject?.() || servicePackage.entitlements || {}), ...BASE_ENTITLEMENTS };
  servicePackage.configuration = { ...(servicePackage.configuration || {}), ...BASE_CONFIGURATION };
  await servicePackage.save();
  const packageIds = (enterprise.servicePackageIds || []).map(String);
  if (!packageIds.includes(String(servicePackage._id))) {
    enterprise.servicePackageIds = [...(enterprise.servicePackageIds || []), servicePackage._id];
    await enterprise.save();
  }
  const granted = [];
  for (const member of members) {
    const entitlement = await grantEnterprisePackageEntitlement({ enterprise, userId: member._id, servicePackage });
    granted.push({ member: member.name || '', entitlementId: String(entitlement._id) });
  }
  console.log(JSON.stringify({ mode: 'applied', ...preview, grantedCount: granted.length, granted }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
