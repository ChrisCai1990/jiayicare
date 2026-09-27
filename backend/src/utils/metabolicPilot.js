const Pilot = require('../models/MetabolicPilot');
const SystemConfig = require('../models/SystemConfig');
const HealthRecord = require('../models/HealthRecord');
const { canReceive, feedbackFor } = require('./metabolicPilotRules');
const tenantFilter = actor => ({ tenantId: actor?.tenantId || null });
const configId = actor => `metabolic-pilot:${String(actor?.tenantId || 'legacy')}`;
async function configFor(actor) {
  const row = await SystemConfig.findOne({ key: configId(actor) }).maxTimeMS(1000).lean();
  return { enabled: row?.value?.enabled === true, accepting: row?.value?.accepting === true, revision: Number(row?.value?.revision || 0) };
}
async function contextFor(user) {
  const [config, enrollment] = await Promise.all([configFor(user), Pilot.findOne({ _id: user._id, ...tenantFilter(user) }).maxTimeMS(1000).lean()]);
  return { config, enrollment, active: canReceive(config, enrollment) };
}
async function historyFor(user, enrollment) {
  if (!enrollment?.startedAt) return [];
  return HealthRecord.find({ user: user._id, ...tenantFilter(user),
    recordedAt: { $gte: enrollment.startedAt, $lte: new Date() }, deletedAt: null })
    .select('_id type value unit status recordedAt').sort({ recordedAt: -1, _id: -1 }).limit(2000).maxTimeMS(1000).lean();
}
async function buildFeedback(user, record) {
  try {
    const ctx = await contextFor(user);
    if (!ctx.active) return null;
    const rows = await historyFor(user, ctx.enrollment);
    const feedback = feedbackFor(record, rows);
    await HealthRecord.updateOne({_id:record._id,user:user._id,value:record.value,recordedAt:record.recordedAt},
      {$set:{metabolicFeedback:feedback}}).maxTimeMS(1000);
    return feedback;
  } catch (err) {
    // Never fail a successfully stored measurement because feedback is unavailable.
    console.warn('[metabolic-pilot] feedback unavailable:', err.name);
    return null;
  }
}
async function feedbackAfterSave(user, record) {
  let timer;
  try { return await Promise.race([buildFeedback(user,record),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1800);})]); }
  finally { clearTimeout(timer); }
}
module.exports = { tenantFilter, configId, configFor, contextFor, historyFor, feedbackAfterSave };
