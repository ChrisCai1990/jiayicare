const SERVICE_FAMILIES = [
  { key: 'checkup_booking', label: '代约检', template: /代约检|约检/, product: /代约检|约检/, workflowKey: 'medical_assist' },
  { key: 'expert_appointment', label: '专家约诊', template: /专家约诊/, product: /专家约诊/, workflowKey: 'medical_proxy', codeDriven: true },
  { key: 'medical_escort', label: '陪同就医', template: /陪同就医|陪诊服务/, product: /陪同就医|陪诊服务/, workflowKey: 'medical_assist' },
  { key: 'medical_proxy', label: '医疗代诊', template: /医疗代诊/, product: /医疗代诊/, workflowKey: 'medical_proxy', codeDriven: true },
  { key: 'checkup_one_stop', label: '体检一站式', template: /体检一站式/, product: /体检一站式/, workflowKey: 'checkup' },
  { key: 'outpatient_one_stop', label: '门诊一站式', template: /门诊一站式/, product: /门诊一站式/, workflowKey: 'medical_assist' },
];

const ids = value => (Array.isArray(value) ? value : []).map(item => String(item?.id || item?._id || item?.planId?._id || item?.planId || item || '')).filter(Boolean);
const sameIds = (left, right) => left.length === right.length && left.every((id, index) => id === right[index]);

function buildReverseModelRows(templates, products) {
  return SERVICE_FAMILIES.map(family => {
    const matchedTemplates = templates.filter(item => family.template.test(item.name || ''));
    const matchedProducts = products.filter(item => family.product.test(item.name || ''));
    const template = matchedTemplates.find(item => item.status === 'active') || matchedTemplates[0] || null;
    const linkedProductId = String(template?.content?.serviceProductId || '');
    const product = matchedProducts.find(item => String(item._id) === linkedProductId) || matchedProducts.find(item => item.status === 'on') || matchedProducts[0] || null;
    const templatePlanIds = ids(template?.content?.followUpPlans?.length
      ? template.content.followUpPlans : template?.content?.followUpPlanId ? [template.content.followUpPlanId] : []);
    const productPlanIds = ids(product?.serviceWorkflow?.modules || []);
    const linked = !!template && !!product && linkedProductId === String(product._id);
    const workflowAligned = !!product && product.serviceWorkflow?.key === family.workflowKey
      && (family.codeDriven || sameIds(templatePlanIds, productPlanIds));
    let status = 'aligned';
    if (!template) status = 'missing_template';
    else if (!product) status = 'missing_product';
    else if (!linked) status = 'unlinked';
    else if (!workflowAligned) status = 'workflow_diff';
    return {
      key: family.key, label: family.label, expectedWorkflowKey: family.workflowKey, codeDriven: !!family.codeDriven,
      status, template: template ? { id: String(template._id), name: template.name, status: template.status, planIds: templatePlanIds } : null,
      product: product ? { id: String(product._id), name: product.name, status: product.status, workflowKey: product.serviceWorkflow?.key || '', planIds: productPlanIds } : null,
      candidates: matchedProducts.map(item => ({ id: String(item._id), name: item.name, status: item.status, workflowKey: item.serviceWorkflow?.key || '' })),
    };
  });
}

module.exports = { SERVICE_FAMILIES, buildReverseModelRows };
