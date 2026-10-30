const crypto = require('node:crypto');
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const Request = require('../models/NutritionAssessmentRequest');
const User = require('../models/User');
const Order = require('../models/Order');
const { settleNutritionAssessmentOrder } = require('./nutritionAssessmentOrder');

const WORKFLOW_KEY = 'nutrition_lifestyle_assessment';
const same = (a, b) => String(a?._id || a || '') === String(b?._id || b || '');
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const requestTaskId = id => new mongoose.Types.ObjectId(crypto.createHash('sha256')
  .update(`nutrition-lifestyle-request:${id}`).digest('hex').slice(0, 24));

async function ensureForRequest(row) {
  if (row.status !== 'booked' && row.status !== 'completed') throw fail('请先完成营养评估预约');
  const id = requestTaskId(row._id);
  const existing = await FollowUp.findById(id).lean();
  if (existing) {
    if (!same(row.executionFollowUpId, id)) await Request.updateOne({ _id: row._id, tenantId: row.tenantId },
      { $set: { executionFollowUpId: id } });
    return existing;
  }
  if (row.status === 'completed') throw fail('需求单已完成，无需重新生成访谈任务');
  const patient = await User.findOne({ _id: row.patientId, tenantId: row.tenantId,
    isDeleted: { $ne: true } }).select('assignedNutritionist').lean();
  if (!patient || !same(patient.assignedNutritionist, row.nutritionistId))
    throw fail('会员责任营养师已变更，请先核对分配');
  const content = [row.reason, row.focus].filter(Boolean).join('\n');
  const task = { _id: id, tenantId: row.tenantId, staffId: row.nutritionistId,
    patientId: row.patientId, assignedTo: row.nutritionistId,
    date: row.appointment?.at || new Date(), type: 'phone', status: 'planned',
    theme: row.assessmentType === 'reassessment' ? '营养复评 · 生活方式访谈' : '单次营养评估 · 生活方式访谈',
    content, plannedContent: content, sourceType: 'professional_assessment', sourceId: row._id,
    workflowKey: WORKFLOW_KEY, deliveryMode: 'single', deliveryType: 'nutrition_assessment',
    clientVisible: false, aiStatus: 'approved', reviewRole: null, reviewAssignedTo: null,
    formData: row.formData?.lifestyleInterview ? { lifestyleInterview: row.formData.lifestyleInterview } : {},
  };
  await FollowUp.updateOne({ _id: id }, { $setOnInsert: task }, { upsert: true, setDefaultsOnInsert: true });
  await Request.updateOne({ _id: row._id, tenantId: row.tenantId,
    status: { $in: ['booked', 'completed'] } }, { $set: { executionFollowUpId: id } });
  return FollowUp.findById(id).lean();
}

async function startForNutritionist(patientId, staff) {
  if (!mongoose.isValidObjectId(patientId)) throw fail('会员ID无效', 400);
  const patient = await User.findOne({ _id: patientId, tenantId: staff.tenantId,
    isDeleted: { $ne: true } }).select('assignedNutritionist').lean();
  if (!patient || !same(patient.assignedNutritionist, staff._id))
    throw fail('仅该会员的责任营养师可发起访谈', 403);
  const existing = await FollowUp.findOne({ patientId, assignedTo: staff._id,
    sourceType: 'professional_assessment', workflowKey: WORKFLOW_KEY, sourceId: null,
    status: { $in: ['planned', 'in_progress', 'missed'] } }).sort({ createdAt: -1 }).lean();
  if (existing) return existing;
  return FollowUp.create({ tenantId: staff.tenantId, staffId: staff._id, patientId,
    assignedTo: staff._id, date: new Date(), type: 'phone', status: 'planned',
    theme: '营养师自主发起 · 生活方式访谈', content: '核实膳食与生活方式，形成营养师评估意见',
    plannedContent: '核实膳食与生活方式，形成营养师评估意见',
    sourceType: 'professional_assessment', workflowKey: WORKFLOW_KEY,
    deliveryMode: 'single', deliveryType: 'nutrition_assessment', clientVisible: false,
    aiStatus: 'approved', reviewRole: null, reviewAssignedTo: null, formData: { selfInitiated: true },
  });
}

async function syncRequestFromInterview(task) {
  if (task.workflowKey !== WORKFLOW_KEY || !task.sourceId || task.status !== 'completed')
    return { status: 'not_applicable' };
  let row = await Request.findOne({ _id: task.sourceId, tenantId: task.tenantId }).lean();
  if (!row) throw fail('关联营养评估需求单不存在', 404);
  const interview = task.formData?.lifestyleInterview;
  if (!interview || interview.phase !== 'submitted') throw fail('访谈尚未提交');
  if (row.status === 'booked') {
    const result = task.executedContent || task.content;
    const updated = await Request.findOneAndUpdate({ _id: row._id, tenantId: row.tenantId,
      status: 'booked' }, { $set: { status: 'completed', executionFollowUpId: task._id,
      assessment: { summary: result, recommendations: interview.notes,
        details: { lifestyleInterview: { questionnaireId: interview.questionnaireId,
          responseId: interview.submissionId, verified: interview.verified,
          pending: interview.pending, method: interview.method } },
        completedAt: task.completedAt || new Date() } },
      $push: { events: { action: 'completed', note: result.slice(0, 200),
        actorId: interview.by, actorName: interview.byName || '营养师',
        at: task.completedAt || new Date() } } }, { new: true }).lean();
    row = updated || await Request.findById(row._id).lean();
  }
  if (row.status !== 'completed') throw fail('关联需求单状态已变化，请人工核对');
  if (!row.sourceOrderId) return { status: 'completed' };
  try {
    await settleNutritionAssessmentOrder(row, { _id: interview.by }, Order);
    await Request.updateOne({ _id: row._id }, { $set: { orderSettlementStatus: 'completed' } });
    return { status: 'completed' };
  } catch (error) {
    await Request.updateOne({ _id: row._id }, { $set: { orderSettlementStatus: 'needs_review' } });
    return { status: 'needs_review', message: error.message };
  }
}

module.exports = { WORKFLOW_KEY, requestTaskId, ensureForRequest, startForNutritionist, syncRequestFromInterview };
