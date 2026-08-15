const SystemConfig = require('../models/SystemConfig');

const DEFAULT_CONFIG = {
  plannerName: '小嘉 | 健康规划师', teamName: '健康服务团队',
  aiOnlineLabel: 'AI在线', humanOnlineLabel: '人工在线',
  plannerCardTitle: '把复查这件事办妥',
  plannerCardSubtitle: '承接复查提醒，结合日常健康记录梳理流程，并按需对接陪诊、代办等服务。',
  greeting: '您好，我是小嘉。您可以把已有的复查提醒或这次要办理的事项告诉我，我会先了解时间、城市、医院偏好和需要的协助，再帮您整理下一步。',
  quickPrompts: ['帮我安排已有的复查提醒', '看看我的血压或体重趋势', '我需要陪诊或代办服务'],
  disclaimer: '内容用于健康管理和复查事项整理，不替代医生诊断和建议。',
  transferText: '这个需求需要进一步人工确认，我可以为您转接人工健康规划师。',
  behaviorPrompt: '优先承接用户已有复查提醒，结合系统提供的日常健康记录，逐步确认目标时间、城市、医院偏好、已有资料和所需协助。先解决流程问题，再按需推荐后台已启用AI推荐的陪诊、代办、约诊等服务；信息不足时追问，无法确认时建议转人工。',
  humanPresenceMinutes: 15,
};

function normalizeConfig(value = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...(value || {}) };
  cfg.quickPrompts = Array.isArray(cfg.quickPrompts) ? cfg.quickPrompts.map(String).map(v => v.trim()).filter(Boolean).slice(0, 6) : [...DEFAULT_CONFIG.quickPrompts];
  Object.keys(DEFAULT_CONFIG).filter(k => typeof DEFAULT_CONFIG[k] === 'string').forEach(k => { cfg[k] = String(cfg[k] || DEFAULT_CONFIG[k]).trim(); });
  cfg.humanPresenceMinutes = Math.min(120, Math.max(5, Number(cfg.humanPresenceMinutes) || 15));
  return cfg;
}

async function getHealthAssistantConfig() {
  const doc = await SystemConfig.findOne({ key: 'healthAssistant' }).lean();
  return normalizeConfig(doc?.value);
}

module.exports = { DEFAULT_CONFIG, normalizeConfig, getHealthAssistantConfig };
