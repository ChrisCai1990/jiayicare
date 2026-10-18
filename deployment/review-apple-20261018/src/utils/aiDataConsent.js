const { AsyncLocalStorage } = require('async_hooks');
const scope = new AsyncLocalStorage();
const VERSION = '2026-10-18.1';
const PURPOSES = {
  assistant: { title: 'AI 会话协助', data: '本次文字、最近的会话文字（含已授权转写的语音文字）、您主动输入的健康信息；不自动附带健康档案、体检报告、联系方式、地址或订单备注。', use: '理解本次交流并生成辅助回复。' },
  health: { title: '健康资料 AI 整理', data: '与您本人本次整理有关的报告原件、检查结果、年龄性别、健康档案、饮食照片及记录、用药、服务需求和随访记录；原件和记录可能含姓名等身份信息。', use: '经您同意后，由您或服务团队发起识别、整理和后续相关草稿生成，结果需专业人员核实。' },
  speech: { title: '语音转写与朗读', data: '您选择发送的录音，或点击朗读的文字；其中可能包含健康等个人信息。', use: '将语音转成文字，或将所选文字合成为语音。' },
};
function disclosure(purpose) {
  if (!PURPOSES[purpose]) return null;
  const speech = purpose === 'speech';
  // No automatic fallback: a different provider needs a separately reviewed disclosure.
  return { purpose, ...PURPOSES[purpose], version: VERSION, provider: speech ? 'aliyun-nls' : 'qwen',
    recipient: speech ? '阿里云计算有限公司（阿里云智能语音交互）' : '通义云启（杭州）信息技术有限公司（阿里云百炼／通义千问）',
    policyUrl: speech ? 'https://help.aliyun.com/zh/isi/support/smart-voice-interaction-product-privacy-policy' : 'https://terms.alicdn.com/legal-agreement/terms/privacy_policy_full/20230801173543354/20230801173543354.html',
    available: purpose === 'assistant' && require('./reviewRuntime').services().ai.enabled(),
    optional: '可拒绝或随时撤回，不影响人工沟通、资料保存及其他无需此服务的功能。撤回阻止后续发送，不能撤销已完成的处理。此授权仅针对本人，不代家庭成员授权。',
  };
}
function withPersonalData(subjectId, purpose, fn) { return scope.run({ subjectId: String(subjectId?._id || subjectId || ''), purpose }, fn); }
function currentPersonalData() { return scope.getStore() || {}; }
function consentError() { const e = new Error('尚未取得该资料主体对本项第三方处理的有效授权，请使用人工服务或在授权设置中确认'); e.code = 'AI_DATA_CONSENT_REQUIRED'; e.status = 403; return e; }
function matches(record, purpose, provider) { return Boolean(record && record.granted === true && record.version === VERSION && record.purpose === purpose && record.provider === provider); }
async function assertPermission(subjectId, purpose, provider, lookup) {
  const d = disclosure(purpose);
  if (!subjectId || !d || provider !== d.provider) throw consentError();
  const read = lookup || (query => require('../models/AiDataConsent').findOne(query).lean());
  const row = await read({ user: subjectId, purpose, provider });
  if (!matches(row, purpose, provider)) throw consentError();
}
async function assertContextPermission(provider, budgetContext = {}) {
  let { subjectId, purpose } = currentPersonalData();
  if (budgetContext.reportId) {
    const report = await require('../models/MedicalReport').findById(budgetContext.reportId).select('user').lean();
    subjectId = report?.user ? String(report.user) : ''; purpose = 'health';
  }
  // Unscoped background jobs fail closed; staff identity is never patient consent.
  await assertPermission(subjectId, provider === 'aliyun-nls' ? 'speech' : purpose, provider);
}
module.exports = { VERSION, PURPOSES, disclosure, matches, withPersonalData, currentPersonalData, assertPermission, assertContextPermission, consentError };
