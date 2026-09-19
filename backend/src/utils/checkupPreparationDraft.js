const { createHash } = require('crypto');
const { assertPreparationOwner, savePreparationEvidence } = require('./annualCheckupEvidence');
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const idOf = value => String(value?._id || value || '');
// 使用MongoDB固有的_id唯一约束；同一准备任务重试/并发不产生第二份草稿。
const draftIdFor = taskId => createHash('sha256').update(`annual-checkup-preparation:v1:${idOf(taskId)}`).digest('hex').slice(0, 24);

function buildPreparationDraft(task, annual, patient, template, actor) {
  if (!patient?.clientBrand || idOf(patient._id) !== idOf(task.patientId) || patient.isDeleted) throw fail('客户档案或所属平台无效', 400);
  if (template?.type !== 'annual_checkup' || template.status !== 'active'
    || (template.clientBrand && template.clientBrand !== patient.clientBrand)) throw fail('体检模板不存在、停用或不属于当前平台', 400);
  const checkItems = template.content?.checkItems;
  if (!Array.isArray(checkItems) || !checkItems.length || checkItems.some(item => !item || typeof item.name !== 'string' || !item.name.trim())) throw fail('模板缺少有效的标准体检项目，请先完善模板', 400);
  const types = { lab: ['检验检查', 'labTest'], exam: ['影像检查', 'specialExam'], func: ['功能医学检测', 'functionalTest'] };
  return {
    _id: draftIdFor(task._id), preparationTaskId: task._id, patientId: task.patientId, staffId: actor._id,
    type: 'annual_checkup', year: annual.year, title: `${annual.year}年${patient.name || ''}体检准备方案`, status: 'draft',
    items: checkItems.map(item => ({ name: item.name, category: (types[item.type] || types.exam)[0],
      itemType: (types[item.type] || types.exam)[1], itemId: item.id || null, itemGroup: 'base', status: 'pending', scheduledDate: null })),
    content: {
      aiStatus: 'pending', generationMode: 'preparation_template', packageName: template.content.packageName || template.name || '',
      packageDesc: template.content.packageDesc || '', checkItems, addons: template.content.addons || [],
      templateId: template._id, templateUpdatedAt: template.updatedAt, clientBrand: patient.clientBrand,
      annualPlanId: annual._id, targetCheckupDate: task.formData.annualCheckupPreparation.targetDate,
      generationGoal: annual.moduleData?.annual_checkup?.focus || '',
      serviceInstanceId: null, serviceInitiationSource: 'annual_preparation',
    },
  };
}

async function createPreparationDraft(task, annual, input, actor, models) {
  if (assertPreparationOwner(task, actor) !== 'familyDoctor') throw fail('仅健康顾问可准备体检方案', 403);
  if (!annual || idOf(annual._id) !== idOf(task.sourceAnnualPlanId) || idOf(annual.patientId) !== idOf(task.patientId)
    || !annual.confirmedAt || !annual.pushedAt || annual.reviewStatus !== 'approved') throw fail('年度方案来源无效');
  if (!['planned', 'in_progress', 'missed'].includes(task.status) || task.isBlocked || task.serviceTracking?.linkId) throw fail('准备任务已结束或锁定，请刷新');
  if (!input.updatedAt || new Date(input.updatedAt).getTime() !== new Date(task.updatedAt).getTime()) throw fail('任务已变化，请刷新');
  const selectedId = task.formData.annualCheckupPreparation.evidence?.healthPlanId;
  if (selectedId) throw fail('本任务已关联方案，请继续编辑原方案，不重复新建');
  const id = draftIdFor(task._id);
  let plan = await models.HealthPlan.findById(id).lean();
  const reused = Boolean(plan);
  if (!plan) {
    if (!models.isValidId(input.templateId)) throw fail('请选择有效的体检模板', 400);
    const [patient, template] = await Promise.all([
      models.User.findById(task.patientId).lean(), models.PlanTemplate.findById(input.templateId).lean(),
    ]);
    const payload = buildPreparationDraft(task, annual, patient, template, actor);
    try {
      await models.HealthPlan.updateOne({ _id: id }, { $setOnInsert: payload }, { upsert: true, runValidators: true });
    } catch (error) {
      // 只吸收本_id的竞争，其他写入错误上抛。
      if (error.code !== 11000 || !error.keyPattern?._id) throw error;
    }
    plan = await models.HealthPlan.findById(id).lean();
  }
  if (!plan || idOf(plan.preparationTaskId) !== idOf(task._id) || idOf(plan.patientId) !== idOf(task.patientId)
    || plan.type !== 'annual_checkup' || plan.status === 'cancelled') throw fail('草稿来源冲突或已取消，请核对原记录');
  // 两文档不假装具备事务：草稿成功但关联失败时保留同一_id，重试只恢复关联，不覆盖编辑。
  await savePreparationEvidence(task, annual, { updatedAt: input.updatedAt, healthPlanId: idOf(plan._id) }, actor, models);
  return { plan, reused };
}

module.exports = { draftIdFor, buildPreparationDraft, createPreparationDraft };
