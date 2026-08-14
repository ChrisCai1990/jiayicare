const { chat } = require('./ai');
const { ARRAY_FIELDS, normalizeAiProfile } = require('./productAiProfile');

function extractJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('AI未返回内容');
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error('AI返回格式无法识别');
}

function normalizeGeneratedDraft(value) {
  const profile = normalizeAiProfile({ ...(value || {}), enabledForRecommendation: false });
  return { ...profile, enabledForRecommendation: false, operatorNotes: '' };
}

async function generateProductAiDraft(product) {
  if (!String(product?.description || '').trim()) throw new Error('请先填写详情描述');
  const productContext = {
    name: String(product.name || '').trim(), subtitle: String(product.subtitle || '').trim(),
    category: String(product.category || '').trim(), description: String(product.description || '').trim(),
    features: Array.isArray(product.features) ? product.features : [],
    fulfillmentType: product.fulfillmentType || 'offline_service',
    serviceLocation: String(product.serviceLocation || '').trim(),
  };
  const keys = [...ARRAY_FIELDS, 'nextAction'];
  const raw = await chat([{ role: 'user', content: `请根据以下商城产品资料生成AI推荐规则。\n\n产品资料：\n${JSON.stringify(productContext, null, 2)}\n\n必须仅输出JSON对象，字段为：${keys.join(', ')}。数组字段每项为简短、可独立判断的中文句子；nextAction只能是inquire、book、buy、handoff之一。` }], {
    systemPrompt: `你是医疗健康商城的产品推荐规则配置助手。你的输出只供运营人员审核，不直接面向客户。
要求：
1. 只依据资料提取，不编造价格、地区、资质、时效、检查能力或服务内容。
2. targetNeeds写客户可能表达的目标需求；suitableFor写明确适用者；notSuitableFor写不应自动推荐者。
3. requiredQuestions必须覆盖购买前会影响适用性、安全性或履约的关键信息。
4. 医疗健康产品必须写清promiseLimits和handoffConditions；急症、诊断、用药调整、特殊人群或资料不足应转人工/就医。
5. supportedCities、includedItems、excludedItems如果资料未明确，返回空数组，不得猜测。
6. 不得把详情中的宣传表述扩展为诊断、疗效或资源保证。
7. 默认nextAction为inquire；只有资料明确支持直接购买且无需专业确认时才可用buy。`,
    jsonMode: true, temperature: 0.1, maxTokens: 2200, timeoutMs: 60000,
  });
  return normalizeGeneratedDraft(extractJsonObject(raw));
}

module.exports = { extractJsonObject, normalizeGeneratedDraft, generateProductAiDraft };
