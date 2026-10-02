const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const ServicePackage = require('../models/ServicePackage');
const PackageEntitlement = require('../models/PackageEntitlement');
const Redemption = require('../models/PackageEntitlementRedemption');
const { buildPackageEntitlementSnapshot } = require('./packageEntitlementSnapshot');
const { applicableEntitlements } = require('./packageEntitlements');

const keyFor = ({ patientId, sourceType, sourceId }) => crypto.createHash('sha256')
  .update(`${patientId}:${sourceType}:${sourceId}`).digest('hex');

function validServiceWindow(user, now) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(user.serviceStartDate || ''))
    ? new Date(`${user.serviceStartDate}T00:00:00+08:00`) : null;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(user.serviceExpiry || ''))
    ? new Date(`${user.serviceExpiry}T23:59:59+08:00`) : null;
  return start && end && start <= now && end >= now ? { start, end } : null;
}

// Older effective service assignments have no purchase snapshot. Freeze their
// current package only when a real service completion first needs recording.
// Their opening balance remains unverified and is never shown as a known remainder.
async function ensureEffectiveServiceLedger(user, now = new Date()) {
  const window = validServiceWindow(user, now);
  if (!window || !user.servicePackage) return null;
  const pkg = await ServicePackage.findOne({ name: user.servicePackage, clientBrand: user.clientBrand || 'jiayiguanjia', active: true }).lean();
  if (!pkg) return null;
  const existing = await PackageEntitlement.findOne({ ownerUserId: user._id, packageId: pkg._id,
    status: 'active', validFrom: { $lte: now }, validUntil: { $gte: now } }).lean();
  if (existing) return existing;
  const sourceOrderId = new mongoose.Types.ObjectId(crypto.createHash('sha256')
    .update(`effective_service:${user._id}:${pkg._id}:${user.serviceStartDate}`).digest('hex').slice(0, 24));
  const snapshot = await buildPackageEntitlementSnapshot(pkg);
  try {
    return await PackageEntitlement.findOneAndUpdate({ sourceOrderId }, { $setOnInsert: {
      ownerUserId: user._id, tenantId: user.tenantId || null, sourceOrderId,
      sourceType: 'effective_service', packageId: pkg._id, packageName: pkg.name,
      clientBrand: pkg.clientBrand, validFrom: window.start, validUntil: window.end,
      familySharing: !!snapshot.familySharing, historyVerified: false, rights: snapshot,
    } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  } catch (error) {
    if (error.code === 11000) return PackageEntitlement.findOne({ sourceOrderId }).lean();
    throw error;
  }
}

function matchingRight(entitlement, productId, workflowKey) {
  const matches = (entitlement.rights?.productEntitlements || []).map((right, index) => ({ right, index }))
    .filter(({ right }) => productId
      ? String(right.productId) === String(productId)
      : right.productSnapshot?.serviceWorkflow?.key === workflowKey);
  return matches.length === 1 ? matches[0] : null;
}

async function recordCompletedService({ patientId, sourceType, sourceId, productId = null, workflowKey = '' }) {
  if (!['order', 'follow_up', 'phase_assessment'].includes(sourceType) || !mongoose.isValidObjectId(patientId)
    || !mongoose.isValidObjectId(sourceId) || !(productId || workflowKey)) return { status: 'not_applicable' };
  const key = keyFor({ patientId, sourceType, sourceId });
  const token = crypto.randomUUID();
  let claim;
  try {
    claim = await Redemption.findOneAndUpdate({ _id: key, $or: [
      { status: 'needs_review' },
      { status: 'processing', startedAt: { $lt: new Date(Date.now() - 10 * 60000) } },
    ] }, { $set: { patientId, sourceType, sourceId, productId: productId || null, status: 'processing', token, startedAt: new Date(), error: '' } },
    { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (error.code === 11000) return { status: (await Redemption.findById(key).lean())?.status || 'processing' };
    throw error;
  }
  if (claim.token !== token) return { status: claim.status };
  try {
    // Recover a crash between the atomic debit and completion of the claim.
    const previous = await PackageEntitlement.findOne({ 'usageRecords.sourceKey': key }).lean();
    if (previous) {
      await Redemption.updateOne({ _id: key, token }, { $set: { status: 'completed', entitlementId: previous._id, completedAt: new Date() } });
      return { status: 'completed', entitlementId: previous._id };
    }
    const user = await User.findById(patientId).select('_id tenantId clientBrand servicePackage serviceStartDate serviceExpiry familyLinks').lean();
    if (!user) throw new Error('会员不存在');
    let rows = await applicableEntitlements(patientId);
    if (!rows.some(row => matchingRight(row, productId, workflowKey))) {
      const effective = await ensureEffectiveServiceLedger(user);
      if (effective) rows = await applicableEntitlements(patientId);
    }
    for (const row of rows) {
      const match = matchingRight(row, productId, workflowKey);
      if (!match) continue;
      const poolIndex = match.right.poolKey
        ? (row.rights?.sharedEntitlementPools || []).findIndex(pool => pool.key === match.right.poolKey) : -1;
      if (match.right.poolKey && poolIndex < 0) continue;
      const path = poolIndex >= 0
        ? `rights.sharedEntitlementPools.${poolIndex}.remainingCount`
        : `rights.productEntitlements.${match.index}.remainingCount`;
      const now = new Date();
      const result = await PackageEntitlement.updateOne({ _id: row._id, status: 'active',
        validFrom: { $lte: now }, validUntil: { $gte: now }, [path]: { $gte: 1 },
        'usageRecords.sourceKey': { $ne: key } }, { $inc: { [path]: -1 }, $push: { usageRecords: {
        productId: match.right.productId, productName: match.right.productName || '',
        poolKey: poolIndex >= 0 ? match.right.poolKey : '', usedByUserId: patientId,
        executionOrderId: sourceType === 'order' ? sourceId : null, sourceKey: key, sourceType,
        sourceId, usedAt: now, status: 'redeemed', note: '实际服务完成后自动核销',
      } } });
      if (result.modifiedCount === 1) {
        await Redemption.updateOne({ _id: key, token }, { $set: { status: 'completed', entitlementId: row._id,
          productId: match.right.productId, completedAt: now } });
        return { status: 'completed', entitlementId: row._id };
      }
    }
    throw new Error('无可用次数或服务包权益未覆盖该服务');
  } catch (error) {
    await Redemption.updateOne({ _id: key, token }, { $set: { status: 'needs_review', error: String(error.message || error).slice(0, 300) } });
    return { status: 'needs_review', error: error.message };
  }
}

async function recordLinkedOrderCompletion(order) {
  if (!order || order.status !== 'completed' || order.packageEntitlementUsage) return { status: 'not_applicable' };
  // A separately paid service must never spend package entitlement again.
  if (order.orderType !== 'service' || order.paymentStatus === 'paid' || Number(order.paidAmount || 0) > 0
    || !mongoose.isValidObjectId(order.serviceId)) return { status: 'not_applicable' };
  const Link = require('../models/FollowUpServiceLink');
  const FollowUp = require('../models/FollowUp');
  const link = await Link.findOne({ targetType: 'order', targetId: order._id, patientId: order.user }).lean();
  if (!link) return { status: 'not_applicable' };
  const request = await FollowUp.findById(link.requestTaskId).select('sourceAnnualPlanId').lean();
  if (!request?.sourceAnnualPlanId) return { status: 'not_applicable' };
  return recordCompletedService({ patientId: order.user, sourceType: 'order', sourceId: order._id, productId: order.serviceId });
}

async function settleReservedPackageOrder(order) {
  const usage = order?.packageEntitlementUsage;
  if (!usage?.entitlementId) return { status: 'not_applicable' };
  if ((order.serviceStartedAt && Number(order.totalUnits || 1) === 1) || order.status === 'completed') {
    const result = await PackageEntitlement.updateOne({ _id: usage.entitlementId,
      usageRecords: { $elemMatch: { executionOrderId: order._id, status: 'reserved' } } },
    { $set: { 'usageRecords.$.status': 'redeemed', 'usageRecords.$.usedAt': order.serviceStartedAt || order.completedAt || new Date() } });
    return { status: result.modifiedCount ? 'completed' : 'unchanged' };
  }
  if (order.status !== 'cancelled' && order.paymentStatus !== 'refunded') return { status: 'reserved' };
  const entitlement = await PackageEntitlement.findById(usage.entitlementId).select('rights').lean();
  if (!entitlement) return { status: 'needs_review' };
  const poolIndex = usage.poolKey
    ? (entitlement.rights?.sharedEntitlementPools || []).findIndex(pool => pool.key === usage.poolKey) : -1;
  const rightIndex = Number.isInteger(usage.rightIndex) ? usage.rightIndex
    : (entitlement.rights?.productEntitlements || []).findIndex(right => String(right.productId) === String(usage.productId));
  if ((usage.poolKey && poolIndex < 0) || (!usage.poolKey && rightIndex < 0)) return { status: 'needs_review' };
  const path = poolIndex >= 0
    ? `rights.sharedEntitlementPools.${poolIndex}.remainingCount`
    : `rights.productEntitlements.${rightIndex}.remainingCount`;
  const result = await PackageEntitlement.updateOne({ _id: usage.entitlementId,
    usageRecords: { $elemMatch: { executionOrderId: order._id, status: 'reserved' } } },
  { $inc: { [path]: 1 }, $set: { 'usageRecords.$.status': 'cancelled' } });
  return { status: result.modifiedCount ? 'cancelled' : 'unchanged' };
}

async function safeRecordLinkedOrderCompletion(order) {
  try { return await recordLinkedOrderCompletion(order); }
  catch (error) { console.error('[package-service-redemption] linked order deferred', order?._id, error.message); return { status: 'needs_review' }; }
}

async function safeReconcilePackageOrder(order) {
  try {
    return order?.packageEntitlementUsage
      ? await settleReservedPackageOrder(order)
      : await recordLinkedOrderCompletion(order);
  } catch (error) {
    console.error('[package-service-redemption] order deferred', order?._id, error.message);
    return { status: 'needs_review' };
  }
}

function isFinalizedNutritionAssessment(item) {
  return item?.status === 'finalized' && !!item.serviceRecordId
    && (item.assessmentDomain === 'nutrition' || item.assessmentMode === 'intensive_nutrition');
}

async function safeRecordFinalizedNutritionAssessment(item) {
  if (!isFinalizedNutritionAssessment(item)) return { status: 'not_applicable' };
  try {
    return await recordCompletedService({ patientId: item.patientId, sourceType: 'phase_assessment',
      sourceId: item._id, workflowKey: 'nutrition_intervention' });
  } catch (error) {
    console.error('[package-service-redemption] phase assessment deferred', item._id, error.message);
    return { status: 'needs_review' };
  }
}

async function scanCompletedServiceRedemptions() {
  const from = process.env.PACKAGE_SERVICE_AUTOREDEEM_FROM;
  if (!from || !Number.isFinite(new Date(from).getTime())) return 0;
  const since = new Date(from);
  const FollowUp = require('../models/FollowUp');
  const Order = require('../models/Order');
  const tasks = await FollowUp.find({ sourceAnnualPlanId: { $ne: null },
    workflowKey: 'annual_nutrition_assessment', status: 'completed', completedAt: { $gte: since } })
    .select('_id patientId').limit(500).lean();
  for (const task of tasks) {
    try { await recordCompletedService({ patientId: task.patientId, sourceType: 'follow_up',
      sourceId: task._id, workflowKey: 'nutrition_intervention' }); }
    catch (error) { console.error('[package-service-redemption] nutrition retry deferred', task._id, error.message); }
  }
  const PhaseAssessment = require('../models/PhaseAssessment');
  const assessments = await PhaseAssessment.find({ status: 'finalized', serviceRecordId: { $ne: null },
    finalizedAt: { $gte: since }, $or: [{ assessmentDomain: 'nutrition' }, { assessmentMode: 'intensive_nutrition' }] })
    .select('_id patientId status serviceRecordId assessmentDomain assessmentMode').limit(500).lean();
  for (const item of assessments) await safeRecordFinalizedNutritionAssessment(item);
  const orders = await Order.find({ $or: [
    { status: 'completed', completedAt: { $gte: since } },
    { packageEntitlementUsage: { $ne: null }, status: 'cancelled', updatedAt: { $gte: since } },
    { packageEntitlementUsage: { $ne: null }, serviceStartedAt: { $gte: since } },
  ] }).select('_id user serviceId orderType totalUnits paymentStatus paidAmount status completedAt serviceStartedAt packageEntitlementUsage').limit(500).lean();
  for (const order of orders) await safeReconcilePackageOrder(order);
  return tasks.length + assessments.length + orders.length;
}

function startPackageServiceRedemptionScheduler() {
  if (!process.env.PACKAGE_SERVICE_AUTOREDEEM_FROM) return;
  setTimeout(() => scanCompletedServiceRedemptions().catch(error => console.error('[package-service-redemption] scan failed', error.message)), 60000).unref?.();
  setInterval(() => scanCompletedServiceRedemptions().catch(error => console.error('[package-service-redemption] scan failed', error.message)), 24 * 60 * 60 * 1000).unref?.();
}

module.exports = { keyFor, matchingRight, ensureEffectiveServiceLedger, recordCompletedService, recordLinkedOrderCompletion, settleReservedPackageOrder, isFinalizedNutritionAssessment, safeRecordFinalizedNutritionAssessment, safeReconcilePackageOrder, scanCompletedServiceRedemptions, startPackageServiceRedemptionScheduler };
