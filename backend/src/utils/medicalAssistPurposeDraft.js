const MAX_PURPOSE_LENGTH = 36;

function cleanPurpose(value) {
  return String(value || '')
    .replace(/^\s*(?:\d+[.、)]|[-•])\s*/, '')
    .replace(/[。；;，,、\s]+$/g, '')
    .trim();
}

function parsePurposeDraft(text) {
  let parsed = text;
  if (typeof text === 'string') {
    const match = text.trim().match(/\{[\s\S]*\}/);
    if (!match) return [];
    try { parsed = JSON.parse(match[0]); } catch { return []; }
  }
  const values = Array.isArray(parsed) ? parsed : parsed?.purposes;
  return Array.isArray(values) ? [...new Set(values.map(cleanPurpose).filter(Boolean))] : [];
}

function isValidPurpose(value) {
  const text = cleanPurpose(value);
  if (text.length < 4 || text.length > MAX_PURPOSE_LENGTH) return false;
  return !/(生成方案|已确认服务日|携带.*身份证|既往病历|需求清单|背景|注意事项|发现遗漏|及时反馈|陪同\/代办|全部慢病管理)/.test(text);
}

async function generateCompactMedicalAssistPurposes(chat, source, context = {}) {
  const prompt = `你只负责把就医代办要求改写成简短的“验收目的”。
输出严格JSON：{"purposes":["…"]}。

硬性规则：
1. 一条只对应一个结果，每条不超过${MAX_PURPOSE_LENGTH}个汉字。
2. 使用“科室/专家：动作+具体项目”的格式；没有专家姓名就写科室，不得编造姓名。
3. 检查单、检查预约、处方、报告领取等不同结果必须拆开。
4. 只写这次要完成什么，不写时间、背景、原因、材料、风险、提醒、流程或“陪同就医”。
5. 原文中只是要求医生判断是否需要的项目，写成“科室：确认是否需要…并按医嘱开单”。
6. 不得遗漏原文明确列出的具体检查项目。

正确示例：
妇科：开具盆腔MRI检查单
消化内科：确认是否需胃肠镜复查并开单
泌尿外科：开具肾错构瘤随访CT检查单

医院：${context.hospital || '未明确'}
科室/专家：${context.department || '未明确'}${context.expert ? `；${context.expert}` : ''}
原始内容：
${String(source || '').trim()}`;
  const response = await chat([{ role: 'user', content: prompt }], {
    maxTokens: 500, temperature: 0, jsonMode: true, timeoutMs: 60000,
  });
  const purposes = parsePurposeDraft(response);
  if (!purposes.length || purposes.some(item => !isValidPurpose(item))) {
    const error = new Error(`AI生成的代办目的仍不够简洁（每条须在${MAX_PURPOSE_LENGTH}字以内），请重试`);
    error.statusCode = 502;
    throw error;
  }
  return purposes;
}

module.exports = { MAX_PURPOSE_LENGTH, cleanPurpose, parsePurposeDraft, isValidPurpose, generateCompactMedicalAssistPurposes };
