const SystemConfig = require('../models/SystemConfig');

const MODE_ALLOWLIST = {
  medication: ['customer_self', 'online_assisted', 'hospital_assisted'],
  supplement: ['customer_self', 'online_assisted', 'internal_product'],
};

const DEFAULT_SUPPLY_WORKFLOW = {
  medication: { enabled: true, leadDays: 3, allowedModes: [...MODE_ALLOWLIST.medication], reviewerRole: 'familyDoctor' },
  supplement: { enabled: true, leadDays: 3, allowedModes: [...MODE_ALLOWLIST.supplement], reviewerRole: 'nutritionist' },
  internalProductKeywords: ['营养改变生活'],
  customerNotificationEnabled: true,
};

function normalizeTypeConfig(type, input = {}) {
  const defaults = DEFAULT_SUPPLY_WORKFLOW[type];
  const requested = Array.isArray(input.allowedModes) ? input.allowedModes : defaults.allowedModes;
  const allowedModes = [...new Set(requested.filter(mode => MODE_ALLOWLIST[type].includes(mode)))];
  return {
    enabled: input.enabled !== false,
    leadDays: Math.min(30, Math.max(3, Math.floor(Number(input.leadDays) || 3))),
    allowedModes: allowedModes.length ? allowedModes : ['customer_self'],
    // 医疗安全责任岗位固定，Admin可查看但不能改成非专业岗位。
    reviewerRole: type === 'medication' ? 'familyDoctor' : 'nutritionist',
  };
}

function normalizeSupplyWorkflowConfig(input = {}) {
  return {
    medication: normalizeTypeConfig('medication', input.medication),
    supplement: normalizeTypeConfig('supplement', input.supplement),
    internalProductKeywords: [...new Set((Array.isArray(input.internalProductKeywords) ? input.internalProductKeywords : DEFAULT_SUPPLY_WORKFLOW.internalProductKeywords).map(v => String(v).trim()).filter(Boolean))].slice(0, 50),
    customerNotificationEnabled: input.customerNotificationEnabled !== false,
  };
}

async function getSupplyWorkflowConfig() {
  const cfg = await SystemConfig.findOne({ key: 'supplyWorkflow' }).lean();
  return normalizeSupplyWorkflowConfig(cfg?.value || DEFAULT_SUPPLY_WORKFLOW);
}

function isInternalProduct(itemName, config) {
  const name = String(itemName || '').trim();
  return !!name && (config.internalProductKeywords || []).some(keyword => name.includes(keyword));
}

module.exports = { DEFAULT_SUPPLY_WORKFLOW, MODE_ALLOWLIST, normalizeSupplyWorkflowConfig, getSupplyWorkflowConfig, isInternalProduct };
