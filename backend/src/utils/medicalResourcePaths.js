const SERVICE_TYPES = new Set(['general_outpatient', 'expert_outpatient', 'international_outpatient', 'checkup', 'other']);

function validateAppointmentContact(payload, { forPublication = false } = {}) {
  if (payload.kind !== 'appointment_rule') return;
  const info = payload.appointmentInfo || {};
  if (!payload.institutionId) throw new Error('预约联系方式必须关联医院');
  if (!SERVICE_TYPES.has(info.serviceType)) throw new Error('请选择普通门诊、专家门诊、国际门诊或体检等服务类型');
  if (info.hospitalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.hospitalEmail)) throw new Error('医院联系邮箱格式无效');
  if (!info.officialPlatform && !info.hospitalPhone && !info.hospitalEmail && !info.internalContactPhone && !(info.channels || []).length) {
    throw new Error('请至少填写一种可用的预约渠道、电话或邮箱');
  }
  if (info.verifiedAt && Number.isNaN(new Date(info.verifiedAt).getTime())) throw new Error('联系方式核实日期格式无效');
  if (forPublication) {
    if (!info.verifiedAt || new Date(info.verifiedAt) > new Date()) throw new Error('发布前请填写实际核实日期');
    if (!String(payload.sourceNote || '').trim()) throw new Error('发布前请填写信息来源与核实人');
    if (!payload.expiresAt || new Date(payload.expiresAt) <= new Date()) throw new Error('发布前请设置未来的复核日期');
  }
}

function knowledgeKindFilter(path, kind) {
  if (path === 'contact') return 'appointment_rule';
  if (path === 'problem') return kind && kind !== 'appointment_rule' ? kind : { $ne: 'appointment_rule' };
  return kind || undefined;
}

module.exports = { validateAppointmentContact, knowledgeKindFilter };
