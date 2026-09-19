const { randomUUID } = require('crypto');
const { assertPreparationOwner, eligibleCheckupPlan } = require('./annualCheckupEvidence');
const { buildAddonInput, suggestPreparationAddons } = require('./checkupPreparationAddons');
const idOf = value => String(value?._id || value || '');
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });

function createSuggestionService(models, chat) {
  const { FollowUp, AnnualPlan, HealthPlan, User, ProfessionalHealthAssessment, MedicalReport, Suggestion } = models;
  async function context(taskId, actor, writable = false) {
    const task = await FollowUp.findById(taskId).lean();
    if (assertPreparationOwner(task, actor) !== 'familyDoctor') throw fail('仅健康顾问可处理AI加项', 403);
    const annual = await AnnualPlan.findById(task.sourceAnnualPlanId).lean();
    if (!annual || idOf(annual._id) !== idOf(task.sourceAnnualPlanId) || idOf(annual.patientId) !== idOf(task.patientId)) throw fail('年度方案来源无效');
    const planId = task.formData.annualCheckupPreparation.evidence?.healthPlanId;
    const plan = planId ? await HealthPlan.findById(planId).lean() : null;
    if (!eligibleCheckupPlan(plan, task, annual) || idOf(plan?.preparationTaskId) !== idOf(task._id)
      || annual.reviewStatus !== 'approved' || !annual.pushedAt) throw fail('请先关联本任务的独立准备草稿');
    if (writable && (!['planned', 'in_progress', 'missed'].includes(task.status) || task.isBlocked || task.serviceTracking?.linkId
      || plan.status !== 'draft' || plan.pushedAt || plan.content?.aiStatus !== 'pending')) throw fail('任务或方案已结束、审核或锁定，请刷新');
    return { task, annual, plan };
  }
  async function inputFor(plan) {
    const [patient, assessments, reports] = await Promise.all([
      User.findById(plan.patientId).lean(),
      ProfessionalHealthAssessment.find({ patientId: plan.patientId, status: 'approved' }).limit(101).lean(),
      MedicalReport.find({ user: plan.patientId, audit_status: 'audited' }).limit(101).lean(),
    ]);
    if (assessments.length > 100 || reports.length > 100) throw fail('资料数量过多，请先整理有效评估摘要');
    try { return { input: buildAddonInput({ plan, patient, assessments, reports }), patient }; }
    catch (error) { throw fail(error.message, 400); }
  }
  async function read(taskId, actor) {
    const { plan } = await context(taskId, actor);
    const run = await Suggestion.findById(plan._id).lean();
    return { run, review: plan.preparationAddonReview || null };
  }
  async function generate(taskId, actor, request) {
    const { plan } = await context(taskId, actor, true);
    if (!request.updatedAt || new Date(request.updatedAt).getTime() !== new Date(plan.updatedAt).getTime()) throw fail('方案已变化，请刷新');
    let old = await Suggestion.findById(plan._id).lean();
    if (old?.status === 'running') return { run: old, reused: true };
    if (plan.preparationAddonReview) throw fail('本次加项已审核，请在方案中人工调整，避免重复生成');
    const { input, patient } = await inputFor(plan);
    if (old && ['ready', 'skipped'].includes(old.status) && old.input.fingerprint === input.fingerprint) return { run: old, reused: true };
    if (old && request.token !== old.token) throw fail('生成记录已变化，请刷新');
    const token = randomUUID();
    const run = { _id: plan._id, token, status: 'running', actorId: actor._id, input, result: null, message: '', startedAt: new Date(), finishedAt: null };
    if (old) {
      const { _id, ...fields } = run;
      const { history, ...previous } = old;
      const update = await Suggestion.updateOne({ _id, token: old.token, status: old.status }, { $set: fields, $push: { history: previous } });
      if (!update.matchedCount) throw fail('已有其他生成请求，请刷新');
    } else {
      try {
        const update = await Suggestion.updateOne({ _id: plan._id }, { $setOnInsert: run }, { upsert: true, runValidators: true });
        if (!update.upsertedCount) return { run: await Suggestion.findById(plan._id).lean(), reused: true };
      } catch (error) {
        if (error.code !== 11000 || !error.keyPattern?._id) throw error;
        return { run: await Suggestion.findById(plan._id).lean(), reused: true };
      }
    }
    try {
      const result = await suggestPreparationAddons(input, (messages, options) => chat(messages, options, { actor, patient }));
      await Suggestion.updateOne({ _id: plan._id, token, status: 'running' }, { $set: {
        result, status: result.status === 'skipped' ? 'skipped' : 'ready', finishedAt: new Date(),
      } });
    } catch (error) {
      // Do not leak provider response/clinical text to persistent error messages.
      await Suggestion.updateOne({ _id: plan._id, token, status: 'running' }, { $set: {
        status: 'failed', message: '生成失败，资料或AI预算/接口需核对；未修改方案，可显式重试', finishedAt: new Date(),
      } });
    }
    return { run: await Suggestion.findById(plan._id).lean(), reused: false };
  }
  async function review(taskId, actor, request) {
    const { plan } = await context(taskId, actor, true);
    if (plan.preparationAddonReview?.token === request.token) return plan;
    if (plan.preparationAddonReview) throw fail('本次加项已审核');
    const run = await Suggestion.findById(plan._id).lean();
    if (!run || run.token !== request.token || !['ready', 'skipped'].includes(run.status)) throw fail('建议尚未生成或版本已变化');
    const { input } = await inputFor(plan);
    if (input.fingerprint !== run.input.fingerprint) throw fail('方案或审核资料已变化，请重新生成后核对');
    if (!Array.isArray(request.indexes) || new Set(request.indexes).size !== request.indexes.length
      || request.indexes.some(index => !Number.isInteger(index) || !run.result.chosen.some(item => item.index === index))) throw fail('选择的加项无效', 400);
    const types = { lab: ['检验检查', 'labTest'], exam: ['影像检查', 'specialExam'], func: ['功能医学检测', 'functionalTest'] };
    const items = run.result.chosen.filter(item => request.indexes.includes(item.index)).map(item => ({
      name: item.name, itemId: item.id || null, category: (types[item.type] || types.exam)[0], itemType: (types[item.type] || types.exam)[1],
      itemGroup: 'addon', notes: item.reason, status: 'pending', scheduledDate: null,
    }));
    const proof = { token: run.token, inputFingerprint: input.fingerprint, indexes: request.indexes, reviewedBy: actor._id, reviewedAt: new Date() };
    // Items and review proof are one document write; a lost response cannot add twice.
    const update = await HealthPlan.updateOne({ _id: plan._id, preparationTaskId: plan.preparationTaskId,
      updatedAt: plan.updatedAt, status: 'draft', pushedAt: null, content: plan.content, items: plan.items,
      preparationAddonReview: null }, { $set: { preparationAddonReview: proof }, ...(items.length ? { $push: { items: { $each: items } } } : {}) }, { runValidators: true });
    if (!update.matchedCount) throw fail('方案已被修改，请刷新后核对');
    return HealthPlan.findById(plan._id).lean();
  }
  async function recover(taskId, actor, request) {
    if (actor.role !== 'superadmin') throw fail('运行中断须由管理员核实恢复', 403);
    if (typeof request.token !== 'string' || !request.token || request.processStopped !== true || typeof request.reason !== 'string' || !request.reason.trim() || request.reason.length > 500) throw fail('请确认旧请求已停止并说明原因', 400);
    const { plan } = await context(taskId, actor);
    const update = await Suggestion.updateOne({ _id: plan._id, token: request.token, status: 'running' }, {
      $set: { status: 'failed', message: '管理员确认旧请求停止，可重新生成', finishedAt: new Date() },
      $push: { history: { event: 'recover', by: actor._id, at: new Date(), reason: request.reason.trim(), token: request.token } },
    });
    if (!update.matchedCount) throw fail('运行记录已变化，请刷新');
    return read(taskId, actor);
  }
  return { read, generate, review, recover };
}
module.exports = { createSuggestionService };
