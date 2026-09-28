const PackageEntitlement = require('../models/PackageEntitlement');
const ServicePackage = require('../models/ServicePackage');
const { legacyAccess } = require('./serviceAccess');
const { applicableEntitlements } = require('./packageEntitlements');
const FEATURES = { aiHealthAnalysis:'AI健康分析', phaseAssessment:'阶段评估', monthlyServiceReview:'月度服务回顾', healthArchiveConcierge:'健康档案管理', healthConsultation:'健康咨询', medicalPlanning:'就医规划', expertAppointment:'专家约诊', reportInterpretation:'报告解读', aiRiskAssessment:'AI风险评估' };

async function legacyPackage(user) {
  if (!user?.servicePackage || !legacyAccess(user).active) return null;
  // A cancelled/expired ledger must never regain rights through a profile label.
  if (await PackageEntitlement.exists({ ownerUserId:user._id })) return null;
  return ServicePackage.findOne({ name:user.servicePackage, clientBrand:user.clientBrand || 'jiayiguanjia', active:true }).lean();
}
function quota(row, legacy) {
  const total = Number(row.count);
  const remaining = Number(row.remainingCount);
  if (legacy || row.remainingCount == null || !Number.isFinite(remaining) || !Number.isFinite(total)) return `计划包含 ${Number.isFinite(total) ? total : '待核对'} 次；已用及剩余待核对`;
  return `总计 ${total} 次 · 已用 ${Math.max(0,total-remaining)} 次 · 剩余 ${remaining} 次`;
}
function project(row, userId, legacy = false) {
  const rights = row.rights || {};
  const items = Object.entries(FEATURES).filter(([key])=>rights.aiEntitlements?.[key] === true).map(([,label])=>({label,value:'计划包含；按计划服务规则执行'}));
  const pools = rights.sharedEntitlementPools || [];
  pools.forEach(pool=>items.push({label:`共享次数：${pool.name}`,value:quota(pool,legacy)}));
  (rights.productEntitlements || []).forEach(item=>{
    const pool=pools.find(p=>p.key===item.poolKey);
    items.push({label:item.productName || '服务项目',value:pool?`使用「${pool.name}」共享次数，不单独累计`:quota(item,legacy)});
  });
  return { id:String(row._id || 'legacy'), name:row.packageName, validFrom:row.validFrom, validUntil:row.validUntil,
    source:legacy?'configuration':'ledger', notice:legacy?'当前计划配置参考；历史使用台账尚未建立，不能据此认定全部次数未使用。':'按已授予权益台账展示；共享次数包含家庭成员的使用。', items,
    usage:(row.usageRecords || []).filter(r=>String(r.usedByUserId)===String(userId)).map(r=>({name:r.productName || '服务项目',usedAt:r.usedAt})) };
}
async function membershipBenefits(user, existingRows) {
  const rows = existingRows || await applicableEntitlements(user._id);
  if (rows.length) return { plans:rows.map(row=>project(row,user._id)), message:'' };
  const pkg = await legacyPackage(user);
  if (!pkg) return { plans:[], message:'暂无当前有效且已确认的会员计划权益，请联系服务团队核对。' };
  const rights = await require('./packageEntitlementSnapshot').buildPackageEntitlementSnapshot(pkg);
  return { plans:[project({ packageName:pkg.name,validFrom:user.serviceStartDate,validUntil:user.serviceExpiry,rights },user._id,true)],message:'' };
}
module.exports = { legacyPackage, membershipBenefits, project };
