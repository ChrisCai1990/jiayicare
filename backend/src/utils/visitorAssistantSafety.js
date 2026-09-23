const EMERGENCY_PATTERN = /(胸痛|呼吸困难|意识不清|昏迷|抽搐|自杀|自伤|大出血|一侧肢体无力|说话不清)/;
const MEDICAL_DETAIL_PATTERN = /(化验|检查报告|检验单|指标|血脂|血糖|血压|处方|药物|用药|剂量|停药|症状|诊断|治疗|病历)/;

function normalizeText(value, maxLength = 500) {
  return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function hasEmergency(text) { return EMERGENCY_PATTERN.test(normalizeText(text)); }
function hasMedicalDetail(text) { return MEDICAL_DETAIL_PATTERN.test(normalizeText(text)); }

function emergencyReply() {
  return '您提到的情况可能需要紧急医疗处置。请立即拨打120或前往最近的急诊医疗机构；不要等待线上回复。嘉医汇无法在线判断病情或提供诊疗建议。';
}

function safeConversation(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-6).map(item => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: normalizeText(item?.content, 500),
  })).filter(item => item.content);
}

module.exports = { normalizeText, hasEmergency, hasMedicalDetail, emergencyReply, safeConversation };
