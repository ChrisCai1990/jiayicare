const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Admin = require('../models/Admin');
const PushRecord = require('../models/PushRecord');
const { DynamicQuestionnaire, QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const { childAgeStage } = require('./childAgeStage');

const TEMPLATE_KEY = 'child-health-age-standard-v1';

function automaticPushId(userId, stageId) {
  return new mongoose.Types.ObjectId(crypto.createHash('sha256')
    .update(`${TEMPLATE_KEY}:${userId}:${stageId}`).digest().subarray(0, 12));
}

async function ensureChildQuestionnairePush(userOrId, models = {}) {
  const users = models.User || User;
  const admins = models.Admin || Admin;
  const pushes = models.PushRecord || PushRecord;
  const questionnaires = models.DynamicQuestionnaire || DynamicQuestionnaire;
  const responses = models.QuestionnaireResponse || QuestionnaireResponse;
  const user = userOrId?._id ? userOrId : await users.findById(userOrId).lean();
  if (!user || user.isDeleted || !user.onboardingCompleted || user.patientCategory !== 'child') return 'ineligible';
  if (user.childArchiveImportPending) return 'archive_review_pending';
  const stage = childAgeStage(user.birthDate);
  if (!stage) return 'missing_age';

  const questionnaire = await questionnaires.findOne({ standardTemplateKey: TEMPLATE_KEY, status: 'active', deletedAt: null }).select('_id title').lean();
  if (!questionnaire) return 'missing_template';
  const priorResponses = await responses.find({ user: user._id, questionnaire: questionnaire._id })
    .select('pushRecordId questionnaireSnapshot.ageStage.id').lean();
  if (priorResponses.some(response => response.questionnaireSnapshot?.ageStage?.id === stage.id)) return 'answered_stage';

  const priorPushes = await pushes.find({ patientId: user._id, type: 'questionnaire', questionnaireId: questionnaire._id })
    .select('_id').lean();
  const answeredPushIds = new Set(priorResponses.map(response => String(response.pushRecordId || '')).filter(Boolean));
  if (priorPushes.some(push => !answeredPushIds.has(String(push._id)))) return 'already_pending';

  const assigned = user.assignedHealthPlanner || user.assignedHealthManager || user.assignedFamilyDoctor;
  const staff = assigned
    ? await admins.findOne({ _id: assigned, staffStatus: 'active', tenantId: user.tenantId || null }).select('_id').lean()
    : null;
  const fallback = staff || await admins.findOne({ username: 'superadmin', staffStatus: 'active', tenantId: user.tenantId || null }).select('_id').lean();
  if (!fallback) return 'missing_staff';

  const result = await pushes.updateOne({ _id: automaticPushId(user._id, stage.id) }, { $setOnInsert: {
    staffId: fallback._id, patientId: user._id, tenantId: user.tenantId || null,
    type: 'questionnaire', questionnaireId: questionnaire._id,
    title: questionnaire.title, content: `系统自动推送（${stage.label}）`,
  } }, { upsert: true });
  await questionnaires.updateOne({ _id: questionnaire._id }, { $addToSet: { targetUsers: user._id } });
  return result.upsertedCount ? 'pushed' : 'already_pending';
}

module.exports = { TEMPLATE_KEY, automaticPushId, ensureChildQuestionnairePush };
