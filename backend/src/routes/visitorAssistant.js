const express = require('express');
const { chat } = require('../utils/ai');
const VisitorLead = require('../models/VisitorLead');
const { normalizeText, hasEmergency, hasMedicalDetail, emergencyReply, safeConversation } = require('../utils/visitorAssistantSafety');

const router = express.Router();
const usageByIp = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_HOUR = 10;

function clientIp(req) { return String(req.ip || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, ''); }
function allowRequest(req) {
  const key = clientIp(req); const now = Date.now(); const existing = usageByIp.get(key);
  const entry = !existing || now - existing.startedAt >= WINDOW_MS ? { startedAt: now, count: 0 } : existing;
  if (entry.count >= MAX_REQUESTS_PER_HOUR) return false;
  entry.count += 1; usageByIp.set(key, entry); return true;
}

const SYSTEM_PROMPT = `你是嘉医汇官网的“咨询准备助手”。只帮助访客梳理非医疗健康管理咨询需求，例如体重管理、生活方式安排、体检资料整理和服务流程。\n\n严格规则：\n1. 不诊断疾病、不解释检查指标、不提供治疗、处方、药物或用药调整建议。\n2. 不索要或复述病历、症状、检查报告、指标、用药等医疗信息；访客提及这些内容时，提醒其不要在本入口提交，并建议向正规医疗机构咨询。\n3. 遇到紧急不适，提示立即拨打120或前往急诊。\n4. 每次只追问一个最必要的非医疗问题；回答不超过160字。\n5. 不承诺服务效果、专家、号源、联系时效或已经转接人工。\n6. 可建议访客留下姓名、电话、城市和方便联系时间，由人工确认服务安排。`;

router.post('/reply', async (req, res) => {
  if (req.body?.consent !== true) return res.status(400).json({ success: false, message: '请先阅读并同意访客咨询信息处理说明。' });
  if (!allowRequest(req)) return res.status(429).json({ success: false, message: '咨询请求过于频繁，请稍后再试或拨打客服电话19106761448。' });
  const messages = safeConversation(req.body?.messages);
  const last = messages[messages.length - 1]?.content || '';
  if (!last) return res.status(400).json({ success: false, message: '请先输入您的咨询方向。' });
  if (hasEmergency(last)) return res.json({ success: true, data: { content: emergencyReply(), handoffSuggested: false, safetyBlocked: true } });
  if (hasMedicalDetail(last)) return res.json({ success: true, data: { content: '为保护您的隐私，请不要在官网咨询入口提交症状、病历、检查指标或用药信息。涉及这些内容请咨询正规医疗机构；如仅需健康管理服务流程协助，我可以继续帮您整理非医疗需求。', handoffSuggested: false, safetyBlocked: true } });
  if (!process.env.QWEN_API_KEY && !process.env.DEEPSEEK_API_KEY) {
    return res.json({ success: true, data: { content: '我可以先帮您梳理咨询准备。请问您更关注体重管理、生活方式安排、体检资料整理，还是了解嘉医汇服务流程？', handoffSuggested: true, aiAvailable: false } });
  }
  try {
    const content = await chat(messages, { systemPrompt: SYSTEM_PROMPT, maxTokens: 280, timeoutMs: 30000 });
    return res.json({ success: true, data: { content: normalizeText(content, 800), handoffSuggested: true, aiAvailable: true } });
  } catch (error) {
    console.error('visitor assistant failed:', error.message);
    return res.status(503).json({ success: false, message: '咨询助手暂时不可用，请稍后再试或拨打客服电话19106761448。' });
  }
});

router.post('/handoff', async (req, res) => {
  const body = req.body || {};
  if (body.consent !== true) return res.status(400).json({ success: false, message: '请先阅读并同意访客咨询信息处理说明。' });
  const name = normalizeText(body.name, 30); const phone = normalizeText(body.phone, 20);
  const city = normalizeText(body.city, 40); const contactWindow = normalizeText(body.contactWindow, 60);
  const topic = normalizeText(body.topic, 60); const summary = normalizeText(body.summary, 500);
  const requestedSource = String(body.source || 'website_ai');
  const source = /^[a-z0-9_-]{1,40}$/i.test(requestedSource) ? requestedSource : 'website_ai';
  if (!name || !/^1\d{10}$/.test(phone)) return res.status(400).json({ success: false, message: '请填写姓名和有效的中国大陆手机号。' });
  if (!topic) return res.status(400).json({ success: false, message: '请选择或填写咨询方向。' });
  if (hasEmergency(summary) || hasMedicalDetail(summary)) return res.status(400).json({ success: false, message: '线下对接申请中请勿填写病历、症状、检查指标或用药信息；相关问题请直接咨询正规医疗机构。' });
  const lead = await VisitorLead.create({ name, phone, city, contactWindow, topic, summary, source, consentAt: new Date() });
  return res.status(201).json({ success: true, data: { id: lead._id }, message: '已收到您的咨询申请。嘉医汇工作人员将根据您留下的联系方式确认服务安排。' });
});

module.exports = router;
