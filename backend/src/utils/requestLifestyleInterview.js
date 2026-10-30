const mongoose = require('mongoose');
const Request = require('../models/NutritionAssessmentRequest');
const User = require('../models/User');
const { DynamicQuestionnaire, QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const { prepare, fingerprint } = require('./lifestyleInterview');
const { effectiveLifestyle } = require('./effectiveLifestyle');
const { getByPath, answerToText } = require('./archiveImport');
const { settleNutritionAssessmentOrder } = require('./nutritionAssessmentOrder');
const Order = require('../models/Order');

const QUESTIONNAIRE_ID = '6a49eab9fc1595013da70645';
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const same = (a, b) => String(a?._id || a || '') === String(b?._id || b || '');
const present = value => value !== undefined && value !== null && value !== '' &&
  (!Array.isArray(value) || value.length > 0) &&
  (typeof value !== 'object' || Array.isArray(value) || ('values' in value ? value.values.length > 0
    : ('value' in value ? !!value.value : Object.values(value).some(present))));

async function handle(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw fail('需求单ID无效', 400);
    let task = await Request.findOne({ _id: req.params.id, tenantId: req.staff.tenantId }).lean();
    if (!task) throw fail('营养评估需求单不存在', 404);
    let user = await User.findOne({ _id: task.patientId, tenantId: req.staff.tenantId, isDeleted: { $ne: true } }).lean();
    if (!user) throw fail('会员不存在', 404);
    const nutritionist = req.staff.role === 'nutritionist' && same(task.nutritionistId, req.staff._id)
      && same(user.assignedNutritionist, req.staff._id);
    const reader = same(task.advisorId, req.staff._id) || same(task.plannerId, req.staff._id)
      || same(task.managerId, req.staff._id);
    if (req.staff.role !== 'superadmin' && !(nutritionist || (req.method === 'GET' && reader)))
      throw fail('仅责任营养师可办理，相关岗位可查看', 403);
    const template = await DynamicQuestionnaire.findById(QUESTIONNAIRE_ID).lean();
    if (!template || template.deletedAt) throw fail('膳食调查问卷不可用，请联系管理员', 400);
    if (req.method === 'GET') {
      const response = await QuestionnaireResponse.findOne({ user: user._id, questionnaire: QUESTIONNAIRE_ID })
        .sort({ submittedAt: -1 }).lean();
      const answers = { ...(response?.answers || {}) }, archive = {};
      for (const question of template.questions || []) {
        const value = getByPath({ ...user, lifestyle_data: effectiveLifestyle(user) }, question.archiveField);
        if (present(value)) archive[question.id] = value;
        if (!present(answers[question.id]) && present(value))
          answers[question.id] = question.type === 'multi' ? (Array.isArray(value) ? value : [value]) : value;
      }
      return res.json({ success: true, data: { task, template, initialAnswers: answers, archive,
        sourceResponseId: response?._id, patientVersion: fingerprint(user), gender: user.gender } });
    }
    if (task.status !== 'booked') throw fail('需求单尚未预约或已结束');
    const body = req.body || {}, old = task.formData?.lifestyleInterview;
    if (!['draft', 'submit'].includes(body.action)) throw fail('操作无效', 400);
    if (old?.phase !== 'applying') {
      if (String(body.baseUpdatedAt) !== new Date(task.updatedAt).toISOString()) throw fail('需求单已更新，请重新打开');
      const prepared = prepare(user, template, body);
      const notes = String(body.notes || '').trim().slice(0, 10000), method = String(body.method || '').trim();
      if (body.action === 'submit') {
        if (!Object.keys(prepared.verified).length || !notes || !['电话访谈', '视频访谈', '当面访谈', '客户问卷核实'].includes(method))
          throw fail('请核实至少一项，并填写访谈方式及评估意见', 400);
        if (body.templateVersion !== new Date(template.updatedAt).toISOString()) throw fail('问卷模板已更新，请重新打开核对');
        if (body.patientVersion !== fingerprint(user)) throw fail('生活方式档案已更新，请重新打开核对');
        if (prepared.items.some(item => present(item.from) && JSON.stringify(item.from) !== JSON.stringify(item.value))
          && body.confirmConflicts !== true) throw fail('请确认已核对与原档案不同的内容', 400);
      }
      const interview = { ...prepared, notes, method, patientVersion: body.patientVersion,
        phase: body.action === 'draft' ? 'draft' : 'applying', submissionId: new mongoose.Types.ObjectId(),
        by: req.staff._id, byName: req.staff.name || req.staff.username, at: new Date(),
        questionnaireId: template._id, questions: template.questions };
      task = await Request.findOneAndUpdate({ _id: task._id, tenantId: task.tenantId, updatedAt: task.updatedAt, status: 'booked' },
        { $set: { formData: { ...(task.formData || {}), lifestyleInterview: interview } } }, { new: true }).lean();
      if (!task) throw fail('需求单已更新，请刷新');
      if (body.action === 'draft') return res.json({ success: true, data: task });
    }
    const interview = task.formData.lifestyleInterview, submissionId = String(interview.submissionId);
    user = await User.findOne({ _id: task.patientId, tenantId: task.tenantId, isDeleted: { $ne: true } }).lean();
    if (!user || (req.staff.role !== 'superadmin' && !same(user.assignedNutritionist, req.staff._id)))
      throw fail('会员或责任营养师已变更，请重新打开', 409);
    if (!(user.lifestyleHistory || []).some(row => row.interviewId === submissionId)) {
      if (interview.patientVersion !== fingerprint(user)) {
        await Request.updateOne({ _id: task._id, 'formData.lifestyleInterview.phase': 'applying',
          'formData.lifestyleInterview.submissionId': interview.submissionId },
        { $set: { 'formData.lifestyleInterview.phase': 'draft' } });
        throw fail('档案已变化，草稿已保留，请重新打开核对后提交');
      }
      const changes = {}, set = {};
      for (const item of interview.items) {
        if (!present(getByPath(user, item.path))) set[item.path] = item.value;
        changes[item.path.slice(15)] = { from: item.from, to: item.value };
      }
      const guard = Object.fromEntries(['lifestyle_data', 'lifestyleHistory', 'archiveVersionHistory']
        .map(key => [key, user[key] === undefined ? { $exists: false } : user[key]]));
      const result = await User.updateOne({ _id: user._id, ...guard,
        'lifestyleHistory.interviewId': { $ne: submissionId } }, { $set: set,
        $push: { lifestyleHistory: { interviewId: submissionId, changes: { lifestyle_data: changes },
          source: 'staff', effectiveAt: interview.at, recordedAt: new Date(), recordedById: interview.by,
          recordedByName: interview.byName, recordedByRole: 'nutritionist', healthStatusChange: interview.notes,
          method: interview.method, sourceQuestionnaireId: template._id } } });
      if (!result.matchedCount) throw fail('档案有并发变化，请重试完成提交');
    }
    await QuestionnaireResponse.updateOne({ _id: interview.submissionId }, { $setOnInsert: {
      questionnaire: template._id, user: user._id, answers: interview.verified, submittedAt: interview.at,
      proxyEntry: { by: interview.by, byName: interview.byName, method: interview.method,
        sourceNutritionAssessmentRequestId: task._id, pendingQuestionIds: interview.pending },
      nutritionistReview: { status: 'reviewed', by: interview.by, byName: interview.byName, at: interview.at },
    } }, { upsert: true });
    const result = ['生活方式访谈评估', `方式：${interview.method}`, `营养师意见：${interview.notes}`,
      `已核实 ${Object.keys(interview.verified).length} 项；待确认 ${interview.pending.length} 项`,
      ...interview.questions.filter(question => Object.hasOwn(interview.verified, question.id))
        .map(question => `${question.text}：${answerToText(interview.verified[question.id])}`)].join('\n');
    const saved = await Request.findOneAndUpdate({ _id: task._id, tenantId: task.tenantId, status: 'booked',
      'formData.lifestyleInterview.phase': 'applying',
      'formData.lifestyleInterview.submissionId': interview.submissionId }, { $set: {
      'formData.lifestyleInterview.phase': 'submitted', status: 'completed',
      assessment: { summary: result, recommendations: interview.notes,
        details: { lifestyleInterview: { questionnaireId: template._id, responseId: interview.submissionId,
          verified: interview.verified, pending: interview.pending, method: interview.method } }, completedAt: new Date() },
    }, $push: { events: { action: 'completed', note: result.slice(0, 200), actorId: req.staff._id,
      actorName: req.staff.name || req.staff.role, at: new Date() } } }, { new: true }).lean();
    if (!saved) throw fail('需求单已变化，请刷新核对提交状态');
    if (saved.sourceOrderId) {
      try {
        await settleNutritionAssessmentOrder(saved, req.staff, Order);
        await Request.updateOne({ _id: saved._id }, { $set: { orderSettlementStatus: 'completed' } });
      } catch (error) {
        await Request.updateOne({ _id: saved._id }, { $set: { orderSettlementStatus: 'needs_review' } });
        throw fail(`访谈已保存，订单核销待核对：${error.message}`, 503);
      }
    }
    return res.json({ success: true, data: saved });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

module.exports = { handle };
