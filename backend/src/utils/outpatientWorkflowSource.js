const PRODUCT_NAME = '门诊一站式服务';

function embeddedOutpatientModules(product, workflowPlans) {
  const modules = product?.serviceWorkflow?.modules || [];
  if (product?.serviceWorkflow?.key !== 'medical_assist' || !modules.length) {
    throw new Error('门诊一站式产品尚未配置有效的岗位流程');
  }
  const byId = new Map(workflowPlans.map(plan => [String(plan._id), plan]));
  const embedded = modules.map((module, sequence) => {
    const id = String(module.planId || '');
    const plan = byId.get(id);
    if (!plan || plan.status !== 'active' || plan.reviewStatus === 'pending_review') {
      throw new Error('门诊一站式产品的岗位流程已变化，请联系管理员核对');
    }
    return { id, name: plan.name, mode: module.mode || 'fixed', trigger: module.trigger || '', sequence, reviewerRole: '' };
  });
  if (!/资料收集与核对/.test(embedded[0].name)) {
    throw new Error('门诊一站式产品的首个岗位任务不是资料收集与核对');
  }
  return embedded;
}

function applyOutpatientModules(content, modules) {
  return { ...content,
    followUpPlanId: modules[0].id, followUpPlanName: modules[0].name,
    followUpPlans: modules, workflowModules: modules, workflowModuleDecisions: [],
    ...(content.moduleData?.visit ? { moduleData: { ...content.moduleData, visit: { ...content.moduleData.visit,
      followUpPlanId: modules[0].id, followUpPlans: modules } } } : {}),
  };
}

async function loadOutpatientModules(Product, FollowUpPlan, tenantId) {
  const product = await Product.findOne({ name: PRODUCT_NAME, tenantId: tenantId || null }).select('serviceWorkflow').lean();
  const ids = (product?.serviceWorkflow?.modules || []).map(module => module.planId).filter(Boolean);
  const plans = ids.length ? await FollowUpPlan.find({ _id: { $in: ids } }).select('_id name status reviewStatus').lean() : [];
  return embeddedOutpatientModules(product, plans);
}

module.exports = { PRODUCT_NAME, embeddedOutpatientModules, applyOutpatientModules, loadOutpatientModules };
