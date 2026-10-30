const FollowUp = require('../models/FollowUp');
const User = require('../models/User');
const { prepareAssignedNutritionAssessment } = require('./assignedNutritionAssessment');

const same = (a, b) => String(a?._id || a || '') === String(b?._id || b || '');
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });

async function handle(req, res) {
  try {
    const task = await FollowUp.findById(req.params.id).lean();
    if (!task || task.workflowKey !== 'annual_nutrition_assessment' || !task.sourceAnnualPlanId)
      throw fail('年度营养评估任务不存在', 404);
    const patient = await User.findById(task.patientId)
      .select('tenantId assignedFamilyDoctor assignedNutritionist isDeleted age gender height weight lifestyle_data healthProfile').lean();
    if (!patient || patient.isDeleted || !same(patient.tenantId, req.staff.tenantId)) throw fail('会员不存在', 404);
    const isNutritionist = req.staff.role === 'nutritionist' && same(task.assignedTo, req.staff._id)
      && same(patient.assignedNutritionist, req.staff._id);
    const isAdvisor = req.staff.role === 'familyDoctor' && same(patient.assignedFamilyDoctor, req.staff._id);
    if (req.staff.role !== 'superadmin' && !(isNutritionist || (req.method === 'GET' && isAdvisor)))
      throw fail('仅责任营养师可办理本次评估', 403);
    if (req.method === 'GET') return res.json({ success: true, data: task });
    if (task.status === 'completed' && task.formData?.assignedNutritionAssessment)
      return res.json({ success: true, data: task });
    if (!['planned', 'in_progress', 'missed'].includes(task.status)) throw fail('任务已结束');
    if (String(req.body?.baseUpdatedAt || '') !== new Date(task.updatedAt).toISOString())
      throw fail('任务已更新，请刷新后重新核对');
    const result = prepareAssignedNutritionAssessment(req.body, patient);
    const now = new Date();
    const saved = await FollowUp.findOneAndUpdate({ _id: task._id, status: task.status,
      updatedAt: task.updatedAt, assignedTo: task.assignedTo }, { $set: {
      status: 'completed', completedAt: now, completedBy: 'staff', aiStatus: 'approved',
      reviewRole: null, reviewAssignedTo: null, isBlocked: false,
      executedContent: `营养评估结论：${result.summary}\n后续建议：${result.recommendations}`,
      formData: { ...(task.formData || {}), assignedNutritionAssessment: {
        ...result, by: req.staff._id, byName: req.staff.name || '', at: now,
      } },
    } }, { new: true });
    if (!saved) throw fail('任务已变化，请刷新后重试');
    let entitlementRedemption = null;
    try {
      entitlementRedemption = await require('./packageServiceRedemption').recordCompletedService({
        patientId: saved.patientId, sourceType: 'follow_up', sourceId: saved._id,
        workflowKey: 'nutrition_intervention',
      });
    } catch (error) {
      console.error('[package-service-redemption] nutrition deferred', saved._id, error.message);
      entitlementRedemption = { status: 'needs_review' };
    }
    return res.json({ success: true, data: saved, entitlementRedemption });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

module.exports = { handle };
