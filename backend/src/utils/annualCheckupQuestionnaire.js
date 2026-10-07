const { createHash } = require('crypto');
// Reuse the configured checkup questionnaire; never select an arbitrary template.
async function sync(plan, patient, tasks) {
  if (plan.checkupPreparationVersion !== 2 || !tasks.some(t => t.formData?.annualCheckupPreparation?.role === 'familyDoctor')) return null;
  const Product = require('../models/Product');
  const PushRecord = require('../models/PushRecord');
  const { DynamicQuestionnaire } = require('../models/DynamicQuestionnaire');
  const products = await Product.find({ status: 'on', 'serviceWorkflow.key': 'checkup' }).select('serviceWorkflow.questionnaireId').lean();
  const ids = [...new Set(products.map(p => String(p.serviceWorkflow?.questionnaireId || '')).filter(Boolean))];
  if (ids.length !== 1) return { role: 'familyDoctor', code: 'questionnaire_configuration', message: '体检问卷尚未唯一配置，请核对体检服务问卷；不影响方案定制' };
  const questionnaire = await DynamicQuestionnaire.findOne({ _id: ids[0], status: 'active', deletedAt: null }).select('title').lean();
  if (!questionnaire) return { role: 'familyDoctor', code: 'questionnaire_configuration', message: '已配置体检问卷不可用，请核对' };
  const id = new (require('mongoose').Types.ObjectId)(createHash('sha256').update(`annual-checkup-questionnaire:${plan._id}`).digest('hex').slice(0,24));
  const doc = { _id: id, tenantId: patient.tenantId || null, patientId: patient._id, staffId: patient.assignedFamilyDoctor,
    type: 'questionnaire', questionnaireId: questionnaire._id, title: questionnaire.title,
    content: '请补充近期健康变化及本次体检关注事项，供健康顾问定制体检方案。', sourceAnnualPlanId: plan._id };
  try { await PushRecord.updateOne({ _id: id }, { $setOnInsert: doc }, { upsert: true }); }
  catch (error) { if(error.code !== 11000 || !await PushRecord.exists({_id:id})) throw error; }
  return null;
}
async function response(planId, patientId) {
  const id = new (require('mongoose').Types.ObjectId)(createHash('sha256').update(`annual-checkup-questionnaire:${planId}`).digest('hex').slice(0,24));
  const push = await require('../models/PushRecord').findOne({ _id: id, patientId }).lean();
  if (!push) return null;
  const { QuestionnaireResponse, DynamicQuestionnaire } = require('../models/DynamicQuestionnaire');
  const answer = await QuestionnaireResponse.findOne({ pushRecordId:id, user:patientId }).sort({submittedAt:-1}).lean();
  const questionnaire = await DynamicQuestionnaire.findById(push.questionnaireId).select('questions').lean();
  return { title:push.title, submittedAt:answer?.submittedAt || null, questions: answer ? (questionnaire?.questions || []).map(q => ({ text:q.text, answer:answer.answers?.[q.id] ?? '' })) : [] };
}
module.exports = { sync, response };
