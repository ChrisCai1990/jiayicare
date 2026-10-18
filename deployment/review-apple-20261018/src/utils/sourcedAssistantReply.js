// Public health education, not a source for personalised diagnoses or treatment.
// URLs and source passages checked against WHO on 2026-10-18.
const SOURCES = Object.freeze({
  'who-bmi': { id: 'who-bmi', title: 'WHO：肥胖与超重（BMI 计算方法）', url: 'https://www.who.int/en/news-room/fact-sheets/detail/obesity-and-overweight', applicability: '仅说明 BMI 计算方法，不用于儿童分级、诊断或个人治疗决定。', text: 'BMI 的计算方法是体重（千克）除以身高（米）的平方。单个数值不能替代专业人员结合其他资料进行评估。' },
  'who-activity': { id: 'who-activity', title: 'WHO：身体活动和久坐行为指南（2020）', url: 'https://www.who.int/europe/publications/i/item/9789240014886', applicability: '一般成人公共健康建议；疾病、孕产期或运动限制应由专业人员评估，不据此制定个人运动处方。', text: 'WHO 的一般成人建议为每周累计 150–300 分钟中等强度有氧活动，或相当量的高强度活动。具体强度和安排需考虑身体情况。' },
  'who-diet': { id: 'who-diet', title: 'WHO：健康饮食', url: 'https://www.who.int/en/news-room/fact-sheets/detail/healthy-diet', applicability: '一般健康饮食科普，不替代疾病饮食、过敏管理或个人营养方案。', text: 'WHO 提倡多样化饮食，包括蔬菜、水果、豆类及全谷物，并限制盐、游离糖和不健康脂肪。具体饮食安排应结合个人情况。' },
});
const REFER = '这涉及个人健康判断或方案，需要专业人员结合完整资料核实。请咨询执业医师或您的服务团队，作医疗决定前请征求医生意见；如有紧急危险，请立即拨打120。';
function formatReply(raw) {
  let value;
  try { value = JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return { content: REFER, references: [] }; }
  if (value.kind === 'education') {
    const ids = Array.isArray(value.sourceIds) ? [...new Set(value.sourceIds)] : [];
    if (!ids.length || ids.length > 3 || ids.some(id => !Object.hasOwn(SOURCES, id))) return { content: REFER, references: [] };
    const refs = ids.map(id => SOURCES[id]);
    // Render only verified source text; never attach a valid URL to arbitrary model prose.
    return { content: refs.map(s => s.text + '\n适用范围：' + s.applicability).join('\n\n') + '\n以上为一般科普，不能代替个体评估。', references: refs.map(({ text, ...ref }) => ref) };
  }
  if (!['social', 'service'].includes(value.kind) || typeof value.content !== 'string' || !value.content.trim()) return { content: REFER, references: [] };
  const content = value.content.trim().slice(0, 800);
  // Conservative last guard for medical advice mislabeled as social/service.
  if (/(诊断|治疗|服用|停药|减药|加药|剂量|处方|降压|降糖|毫米汞柱|mmHg|mmol|BMI|公斤|千克|卡路里|kcal|每日.*(?:克|毫克|分钟)|每周.*分钟|正常范围|患有|可能是.*病|建议.*(?:运动|饮食|检查|就医))/i.test(content)) return { content: REFER, references: [] };
  return { content, references: [] };
}
async function generate(messages, systemPrompt, chat) {
  const instructions = '\n输出严格 JSON：{ "kind":"social|service|education|medical", "content":"...", "sourceIds":[] }。social 仅情绪与日常交流，service 仅非医学服务流程。健康/医学建议、计算、指标判断绝不能标为social或service。个人症状、检查解读、疾病治疗、剂量、个性化营养/运动或不确定情况必须标medical。只有用户询问一般科普时可标education并选择下方对应ID；不得生成来源URL或编造依据。education的自由文本不会展示。可用科普：' + JSON.stringify(Object.values(SOURCES).map(s => ({ id: s.id, text: s.text, applicability: s.applicability })));
  return formatReply(await chat(messages, { systemPrompt: systemPrompt + instructions, provider: 'qwen', maxTokens: 500, jsonMode: true }));
}
module.exports = { SOURCES, REFER, formatReply, generate };
