const crypto = require('crypto');
const { KEY, TITLE, QUESTIONS } = require('./sleepIntake');
const idFor = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
const TEMPLATE_ID = idFor(KEY);
async function pushSleepIntake(userId) {
  const User = require('../models/User');
  const { DynamicQuestionnaire, QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
  const PushRecord = require('../models/PushRecord');
  const Admin = require('../models/Admin');
  const tenantId = await require('./jiayihuiTenant').jiayihuiTenantId();
  if (!tenantId) throw new Error('嘉医汇机构未配置');
  const user = await User.findOne({ _id: userId, tenantId, onboardingCompleted: true,
    isDeleted: { $ne: true }, patientCategory: { $ne: 'child' }, 'reviewExperience.enabled': { $ne: true } }).lean();
  if (!user) return 'ineligible';
  const q = await DynamicQuestionnaire.findOne({ _id: TEMPLATE_ID, standardTemplateKey: KEY, status: 'active', deletedAt: null });
  if (!q) return 'template_unavailable';
  if (await QuestionnaireResponse.exists({ user: userId, questionnaire: q._id })) return 'answered';
  const staff = (user.assignedHealthManager ? await Admin.findOne({ _id: user.assignedHealthManager, tenantId }).select('_id') : null)
    || await Admin.findOne({ tenantId, role: 'superadmin' }).sort({ _id: 1 }).select('_id');
  if (!staff) return 'missing_operator';
  // Repair audience on retry even when the push was already created.
  await DynamicQuestionnaire.updateOne({ _id: q._id }, { $addToSet: { targetUsers: userId } });
  if (await PushRecord.exists({ patientId: userId, questionnaireId: q._id })) return 'already_pushed';
  const result = await PushRecord.updateOne({ _id: idFor(`${KEY}:${userId}`), patientId: userId },
    { $setOnInsert: { staffId: staff._id, patientId: userId, tenantId, type: 'questionnaire', questionnaireId: q._id,
      title: TITLE, content: '睡眠情况采集，请按实际情况填写。' } }, { upsert: true });
  return result.upsertedCount ? 'pushed' : 'already_pushed';
}
module.exports = { pushSleepIntake, TEMPLATE_ID, idFor };
