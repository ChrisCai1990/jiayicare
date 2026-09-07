const REVIEW_ROLE = { medication: 'familyDoctor', supplement: 'nutritionist' };

const STATUS_ROLE = {
  intake_pending: 'healthManager',
  info_required: 'healthManager',
  arrangement_pending: 'healthPlanner',
  fulfillment_pending: 'medicalAssistant',
  receipt_pending: 'healthManager',
};

const MODE_LABEL = {
  undecided: '待确认', customer_self: '客户自购', online_assisted: '线上协助购买',
  hospital_assisted: '医院配药', internal_product: '自研产品履约',
};

function isWithinLeadWindow(plan, now = new Date()) {
  if (!plan?.nextDueDate) return false;
  const leadDays = Math.max(3, Number(plan.leadDays) || 3);
  return new Date(plan.nextDueDate).getTime() <= now.getTime() + leadDays * 86400000;
}

function appendAudit(plan, staff, action, note = '') {
  plan.auditLog = [...(plan.auditLog || []), {
    action, note, at: new Date(), staffId: staff?._id || null, staffName: staff?.name || '', role: staff?.role || '',
  }].slice(-100);
}

function parseAiJson(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text);
}

module.exports = { REVIEW_ROLE, STATUS_ROLE, MODE_LABEL, isWithinLeadWindow, appendAudit, parseAiJson };
