const PackageEntitlement = require('../models/PackageEntitlement');
const ServicePackage = require('../models/ServicePackage');
const { legacyAccess } = require('./serviceAccess');
const { applicableEntitlements } = require('./packageEntitlements');
const { effectivePackageName } = require('./effectivePackageName');
const FEATURES = { aiHealthAnalysis:'AI健康趋势分析', phaseAssessment:'阶段性评估', monthlyServiceReview:'月度服务回顾（内部）', healthArchiveConcierge:'健康档案更新与管理', healthConsultation:'健康咨询', medicalPlanning:'就医规划', expertAppointment:'专家约诊（不指定）', reportInterpretation:'报告解读', aiRiskAssessment:'AI风险评估' };

async function legacyPackage(user) {
  if (!user?.servicePackage || !legacyAccess(user).active) return null;
  // A cancelled/expired ledger must never regain rights through a profile label.
  if (await PackageEntitlement.exists({ ownerUserId:user._id })) return null;
  return ServicePackage.findOne({ name:effectivePackageName(user), clientBrand:user.clientBrand || 'jiayiguanjia', active:true }).lean();
}
function quota(row, legacy, reserved = 0, newlyRedeemed = 0) {
  const total = Number(row.count);
  const remaining = Number(row.remainingCount);
  if (legacy || row.remainingCount == null || !Number.isFinite(remaining) || !Number.isFinite(total)) return `计划包含 ${Number.isFinite(total) ? total : '待核对'} 次；${newlyRedeemed ? `新增已核销 ${newlyRedeemed} 次；` : ''}历史已用及剩余待核对`;
  return `总计 ${total} 次 · 已核销 ${Math.max(0,total-remaining-reserved)} 次 · 已预占 ${reserved} 次 · 可用 ${remaining} 次`;
}
function project(row, userId, legacy = false) {
  const rights = row.rights || {};
  const openingUnverified = legacy || row.historyVerified === false;
  const items = Object.entries(FEATURES).filter(([key])=>rights.aiEntitlements?.[key] === true).map(([,label])=>({label,value:'计划包含；按计划服务规则执行'}));
  const pools = rights.sharedEntitlementPools || [];
  const services = rights.productEntitlements || [];
  const reservedFor = item => (row.usageRecords || []).filter(record => record.status === 'reserved'
    && (item.key ? record.poolKey === item.key : !record.poolKey && String(record.productId) === String(item.productId))).length;
  const redeemedFor = item => (row.usageRecords || []).filter(record => record.status !== 'reserved' && record.status !== 'cancelled'
    && (item.key ? record.poolKey === item.key : !record.poolKey && String(record.productId) === String(item.productId))).length;
  const describeQuota = item => ({
    name:item.productName || item.name || '服务项目',
    total:Number.isFinite(Number(item.count)) ? Number(item.count) : null,
    usageKnown:!legacy && row.historyVerified !== false && item.remainingCount != null && Number.isFinite(Number(item.remainingCount)) && Number.isFinite(Number(item.count)),
    remaining:legacy || item.remainingCount == null ? null : Number(item.remainingCount),
    detail:quota(item,openingUnverified,reservedFor(item),redeemedFor(item)),
  });
  const groups = {
    features:items.map(item=>item.label),
    serviceStages:[
      {name:'了解健康',keys:['healthArchiveConcierge','aiHealthAnalysis','aiRiskAssessment']},
      {name:'持续管理',keys:['healthConsultation','reportInterpretation','phaseAssessment','monthlyServiceReview']},
      {name:'就医支持',keys:['medicalPlanning','expertAppointment']},
    ].map(stage=>({name:stage.name,services:stage.keys.filter(key=>rights.aiEntitlements?.[key]===true).map(key=>({
      name:FEATURES[key],
      internal:key==='monthlyServiceReview',
      frequency:key==='phaseAssessment'?({biweekly:'每两周',monthly:'每月',quarterly:'每季度'}[rights.phaseAssessmentFrequency]||'按计划阶段安排'):key==='monthlyServiceReview'?`每月 · 第 ${rights.monthlyReviewStartMonth||1} 月起`:key==='healthArchiveConcierge'?'实时':key==='aiHealthAnalysis'?'每个会员服务期 1 次':['healthConsultation','medicalPlanning','expertAppointment','reportInterpretation'].includes(key)?'服务期内不限次':'已包含 · 频次待确认',
    }))})).filter(stage=>stage.services.length),
    shared:pools.map(pool=>({...describeQuota(pool),services:services.filter(item=>item.poolKey===pool.key).map(item=>item.productName || '服务项目')})),
    independent:services.filter(item=>!pools.some(pool=>pool.key===item.poolKey)).map(describeQuota),
  };
  pools.forEach(pool=>items.push({label:`共享次数：${pool.name}`,value:quota(pool,openingUnverified,reservedFor(pool),redeemedFor(pool))}));
  (rights.productEntitlements || []).forEach(item=>{
    const pool=pools.find(p=>p.key===item.poolKey);
    items.push({label:item.productName || '服务项目',value:pool?`使用「${pool.name}」共享次数，不单独累计`:quota(item,openingUnverified,reservedFor(item),redeemedFor(item))});
  });
  return { id:String(row._id || 'legacy'), name:row.packageName, validFrom:row.validFrom, validUntil:row.validUntil,
    source:legacy?'configuration':'ledger', notice:legacy?'当前计划配置参考；历史使用台账尚未建立，不能据此认定全部次数未使用。':row.historyVerified === false?'已自动记录本次起的实际服务核销；历史使用仍待核对，暂不显示确定剩余次数。':row.familySharing?'按已授予权益台账展示；家庭共用额度包含家庭成员的使用。':'按已授予权益台账展示。', items, groups,
    usage:(row.usageRecords || []).filter(r=>r.status !== 'reserved' && r.status !== 'cancelled' && String(r.usedByUserId)===String(userId)).map(r=>({name:r.productName || '服务项目',usedAt:r.usedAt})) };
}
async function membershipBenefits(user, existingRows) {
  const rows = existingRows || await applicableEntitlements(user._id);
  if (rows.length) return { plans:rows.map(row=>project(row,user._id)), message:'' };
  const pkg = await legacyPackage(user);
  if (!pkg) return { plans:[], message:user?.servicePackage && legacyAccess(user).active
    ? `档案中的「${user.servicePackage}」尚未关联到已生效的服务包配置或权益台账，请联系服务团队核对套餐来源。`
    : '暂无当前有效且已确认的会员计划权益，请联系服务团队核对。' };
  const rights = await require('./packageEntitlementSnapshot').buildPackageEntitlementSnapshot(pkg);
  return { plans:[project({ packageName:pkg.name,validFrom:user.serviceStartDate,validUntil:user.serviceExpiry,rights },user._id,true)],message:'' };
}
module.exports = { legacyPackage, membershipBenefits, project };
