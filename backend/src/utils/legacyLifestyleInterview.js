const FollowUp = require('../models/FollowUp');
const { QuestionnaireResponse } = require('../models/DynamicQuestionnaire');

const QUESTIONNAIRE_ID = '6a49eab9fc1595013da70645';
const activeStatuses = ['planned', 'in_progress', 'missed'];
const duplicateWindowMs = 24 * 60 * 60 * 1000;
const cancelReason = '旧版生活方式访谈已由膳食调查问卷及营养师复核流程承接';
const duplicateReason = '同一生活方式访谈已完成，关闭重复生成的旧版任务';

// The standalone interview entry has been retired. A submitted dietary survey
// now has a dedicated nutritionist review todo. Also retire a task started
// shortly after another standalone interview was completed for the same patient.
async function reconcileLegacyLifestyleInterviews(patientId, assignedTo, models = { FollowUp, QuestionnaireResponse }) {
  const taskFilter = {
    sourceType: 'professional_assessment', workflowKey: 'lifestyle_interview',
    status: { $in: activeStatuses },
    'formData.lifestyleInterview.phase': { $nin: ['applying', 'submitted'] },
    ...(patientId ? { patientId } : {}),
    ...(assignedTo ? { assignedTo } : {}),
  };
  const tasks = await models.FollowUp.find(taskFilter)
    .select('_id patientId createdAt formData.lifestyleInterview.phase').lean();
  if (!tasks.length) return 0;
  const patientIds = [...new Set(tasks.map(task => String(task.patientId)))];
  const completed = await models.FollowUp.find({
    sourceType: 'professional_assessment', workflowKey: 'lifestyle_interview',
    status: 'completed', patientId: { $in: patientIds }, completedAt: { $ne: null },
  }).select('patientId completedAt').lean();
  const completedByPatient = new Map();
  for (const task of completed) {
    const key = String(task.patientId);
    if (!completedByPatient.has(key)) completedByPatient.set(key, []);
    completedByPatient.get(key).push(new Date(task.completedAt).getTime());
  }
  const duplicates = tasks.filter(task => {
    const created = new Date(task.createdAt).getTime();
    return Number.isFinite(created) && (completedByPatient.get(String(task.patientId)) || [])
      .some(at => at <= created && created - at <= duplicateWindowMs);
  });
  const duplicateIds = new Set(duplicates.map(task => String(task._id)));
  const surveyCandidates = tasks.filter(task =>
    !duplicateIds.has(String(task._id)) && !task.formData?.lifestyleInterview &&
    Number.isFinite(new Date(task.createdAt).getTime()));
  const latestSurveyByPatient = new Map();
  if (surveyCandidates.length) {
    const ids = [...new Set(surveyCandidates.map(task => String(task.patientId)))];
    const earliest = new Date(Math.min(...surveyCandidates.map(task => new Date(task.createdAt).getTime())));
    const responses = await models.QuestionnaireResponse.find({
      questionnaire: QUESTIONNAIRE_ID, user: { $in: ids }, submittedAt: { $gte: earliest },
    }).select('user submittedAt').lean();
    for (const response of responses) {
      const key = String(response.user), at = new Date(response.submittedAt).getTime();
      latestSurveyByPatient.set(key, Math.max(latestSurveyByPatient.get(key) || 0, at));
    }
  }
  const surveyIds = surveyCandidates
    .filter(task => (latestSurveyByPatient.get(String(task.patientId)) || 0) >=
      new Date(task.createdAt).getTime()).map(task => task._id);
  let modified = 0;
  if (duplicateIds.size) {
    const result = await models.FollowUp.updateMany({
      ...taskFilter, _id: { $in: duplicates.map(task => task._id) },
    }, { $set: { status: 'cancelled', cancelReason: duplicateReason } });
    modified += result.modifiedCount || 0;
  }
  if (surveyIds.length) {
    const result = await models.FollowUp.updateMany({
      ...taskFilter, _id: { $in: surveyIds },
      'formData.lifestyleInterview': { $exists: false },
    }, { $set: { status: 'cancelled', cancelReason } });
    modified += result.modifiedCount || 0;
  }
  return modified;
}

module.exports = { reconcileLegacyLifestyleInterviews, cancelReason, duplicateReason, QUESTIONNAIRE_ID };
