const express = require('express');
const auth = require('../middleware/auth');
const { chat, parseImage } = require('../utils/ai');
const { uploadBase64 } = require('../utils/oss');
const ChatLog = require('../models/ChatLog');
const HealthRecord = require('../models/HealthRecord');
const User = require('../models/User');
const Message = require('../models/Message');
const Product = require('../models/Product');
const ServiceProposal = require('../models/ServiceProposal');
const Reminder = require('../models/Reminder');
const FollowUp = require('../models/FollowUp');
const { resolveHealthPlanner } = require('../utils/healthPlannerAssignment');
const { isAiRecommendable, buildAiCatalogEntry, resolveProductPrices } = require('../utils/productAiProfile');
const { getHealthAssistantConfig } = require('../utils/healthAssistantConfig');
const router = express.Router();

const BASE_SYSTEM = `你是「小嘉｜健康规划师」，嘉医汇帮助会员把复查安排办妥的智能服务助手，不是泛健康问答机器人。你的核心工作是承接会员已有的复查提醒，结合平台提供的日常健康记录，帮助会员梳理复查准备、时间与办理流程，并按需匹配平台已上架的陪诊、代办、约诊等服务；无法确认或会员要求时转接人工健康规划师。

回答要求：
1. 使用中文，语气温和专业
2. 回答控制在200字以内，简洁精准
3. 必须先像真人顾问一样理解客户，再谈服务。客户只表达宽泛意向（如“我想体检”“想找专家”）时，禁止直接提及、匹配或推荐具体服务产品；先自然追问1—2个最关键问题，不要一次罗列问卷
4. 只有需求基本清楚后，才可推荐平台已有服务。推荐前先简短复述对客户需求的理解并说明理由；不得仅凭“体检”“专家”等关键词命中产品
5. 必须承接客户刚刚回答的信息，不得重复已经问过或客户已经回答的问题。客户追问价格、流程、时间或服务内容时，先直接回答该问题，再视需要补问一个问题
6. 可以读取系统提供的复查提醒及日常健康记录（如血压、体重趋势），用通俗语言复述客观变化，并据此提醒会员准备资料或向专业人员确认；不得据此诊断疾病、判断病情、制定检查项目或调整用药
7. 对明确的复查事项，优先给出可执行的办理清单：确认医嘱/提醒来源、目标时间、城市与医院偏好、需要携带的已有资料、是否需要陪诊或代办。信息不足时逐步追问，不得虚构医院流程、号源或检查要求
8. 不提供疾病诊断、治疗方案、处方、线上复诊、检查开单、药品推荐、停换药或剂量调整，不解读症状来判断疾病
7. 遇到医疗问题，简短说明超出服务范围，建议前往正规医疗机构；遇到胸痛、呼吸困难、意识障碍等紧急情况，提示立即拨打120
8. 不捏造会员信息，不制造焦虑，不承诺疗效，不使用“治愈”“治疗”“保证改善”等表述
9. 服务推荐必须说明推荐理由，由会员自主选择，不得诱导购买高价套餐
10. 会员需要专家时，只了解城市、医院/科室倾向、疾病方向和时间偏好，然后推荐平台的约诊服务；禁止生成或推荐具体专家姓名、职称、擅长领域、科研经历、号源和预约难度，除非这些信息来自本次请求提供的、可核验的平台结构化数据
11. 会员需要体检时，只推荐平台已上架的体检咨询或预约服务；禁止自行组合检查项目、创造套餐名称、制定体检方案或根据健康资料判断应做哪些检查
12. 可以为复查事项整理“办理清单”，但不得将其表述为诊疗方案或个性化检查方案。需要进一步人工协助时，应说明可转接人工健康规划师，不能声称已经转接；只有系统返回转接成功后才能说已转接
13. 仅在涉及指标解释、报告、症状或诊疗边界时，在回答末尾加一次：「以上仅用于健康管理与复查事项整理，不替代医生诊断和建议。」普通流程问答和服务推荐不重复免责声明
14. 只能介绍平台已经上线的能力。当前对话支持文字回复、语音播报和转人工，不支持把对话内容导出或下载为文件，不支持生成图文版/PDF，也不支持直接微信推送。不得承诺、暗示或规划这些未上线能力；会员询问时应如实说明暂不支持`;

const UNSUPPORTED_CAPABILITY_NOTICE = '当前对话暂不支持导出、下载、生成图文版或直接微信推送；您可以在本页面查看和使用语音播报。';

const NUTRITION_SYSTEM = `你是嘉医汇AI营养师，只提供一般性饮食与体重管理建议，不诊断疾病、不调整药物、不承诺疗效。
请根据客户文字、饮食照片和健康档案做保守估算。照片看不到的油、糖、调味料和重量不得假装精确；信息不足时必须追问。
输出严格JSON，不要Markdown：
{"mealSummary":"餐食概述","foods":[{"name":"食物","portion":"估算份量","calorieMin":0,"calorieMax":0}],"calorieMin":0,"calorieMax":0,"protein":"蛋白质估算范围或未知","carbs":"碳水估算范围或未知","fat":"脂肪估算范围或未知","assessment":"简短评价","suggestions":["建议"],"questions":["需要客户补充的问题"],"riskFlags":["过敏、疾病、孕产、儿童、进食障碍或明显异常风险"],"confidence":"high|medium|low","reply":"给客户的中文回复，300字内，说明是估算；有风险时建议联系专业人员"}`;

function parseAiJson(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text);
}

function nutritionUserContext(user) {
  const profile = user.healthProfile || {};
  const allergies = [profile.foodAllergy, ...(profile.allergies || []).map(a => a?.substance || a?.name || a)].filter(Boolean);
  return [
    user.age && `年龄${user.age}岁`, user.gender && user.gender !== '未知' && `性别${user.gender}`,
    user.height && `身高${user.height}cm`, user.weight && `档案体重${user.weight}kg`,
    user.chronicDiseases?.length && `慢病${user.chronicDiseases.join('、')}`,
    allergies.length && `过敏${allergies.join('、')}`,
    user.healthConcern && `健康目标/关注${user.healthConcern}`,
  ].filter(Boolean).join('；');
}

// 模型偶尔会越过提示词承诺尚未上线的平台能力。返回前做确定性兜底，
// 只拦截肯定式能力承诺；“暂不支持/无法/不能”等真实说明保持原样。
function guardUnsupportedCapabilityClaims(reply) {
  const text = String(reply || '');
  const sentences = text.match(/[^。！？!?\n]+[。！？!?]?|\n+/g) || [text];
  let removed = false;
  const kept = sentences.filter(sentence => {
    const mentionsUnsupported = /(导出|下载|微信推送|图文版|PDF|文件版)/i.test(sentence);
    const isDenial = /(不支持|暂不|无法|不能|尚未|未上线|没有)/.test(sentence);
    const isPromise = /(支持|可以|可供|可直接|能够|将为|生成|制作|提供)/.test(sentence);
    if (mentionsUnsupported && isPromise && !isDenial) {
      removed = true;
      return false;
    }
    return true;
  });
  if (!removed) return text;
  return `${kept.join('').trim()}\n${UNSUPPORTED_CAPABILITY_NOTICE}`.trim();
}

// 从AI健康分析/风险评估结果中摘取要点，供对话时结合上下文回答（只取已审核可见的版本，与会员当前实际看到的一致）
function buildHealthInsightContext(user) {
  const lines = [];
  const summary = user.aiHealthSummary || {};
  const byYear = summary.byYear || {};
  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));
  const latestYear = years[0];
  const latestEntry = latestYear ? byYear[latestYear] : null;
  if (latestEntry?.sections) {
    const s = latestEntry.sections;
    if (s.medical_priority?.items?.length) {
      lines.push(`【AI健康信息整理·${latestYear}年度·重点关注信息】` + s.medical_priority.items.map(i => `${i.name}（${i.urgency}）：${i.action || ''}`).join('；'));
    }
    if (s.lifestyle_assessment?.summary) {
      lines.push(`【生活方式评估】${s.lifestyle_assessment.summary}`);
    }
  }
  const risk = user.aiRiskAssessment || {};
  if (risk.overallSummary) {
    lines.push(`【健康关注提示】整体关注程度：${risk.overallLevel || '未知'}；${risk.overallSummary}`);
  }
  return lines.length ? `\n会员健康管理资料摘要（仅用于梳理服务需求，不得据此诊断或治疗）：\n${lines.join('\n')}` : '';
}

// 意图识别（关键词规则，快速无额外API调用）
function detectIntent(text) {
  const t = text.toLowerCase();
  const serviceKw = ['预约', '体检', '服务包', '套餐', '怎么买', '购买', '流程', '开通', '续费', '多少钱', '价格', '规划', '需求'];
  const dataKw = ['我的', '最新', '上次', '多少', '几点', '血压', '血糖', '心率', '体重', '睡眠', '查一下', '看看'];
  const outKw = ['处方', '手术', '住院', '诊断', '开药', '什么病', '怎么治疗', '吃什么药', '停药', '换药', '剂量', '问诊', '开单'];

  if (outKw.some(k => t.includes(k))) return 'out_of_scope';
  if (dataKw.filter(k => t.includes(k)).length >= 2) return 'data';
  if (serviceKw.some(k => t.includes(k))) return 'service';
  return 'knowledge';
}

async function buildVerifiedServiceReply(lastUserMsg, messages = []) {
  const customerText = messages
    .filter(message => message.role === 'user')
    .map(message => String(message.content || ''))
    .join(' ');
  const recentCustomerText = messages
    .filter(message => message.role === 'user')
    .slice(-3)
    .map(message => String(message.content || ''))
    .join(' ');
  const asksForExpert = /(专家|医生|挂号|约诊)/.test(recentCustomerText);
  const asksForCheckup = /(体检|健康检查)/.test(recentCustomerText);
  if (!asksForExpert && !asksForCheckup) return null;

  const asksForPrice = /(收费|价格|多少钱|费用|价钱)/.test(lastUserMsg);
  const needDimensions = [
    /(本人|自己|家人|父母|孩子|员工|单位|企业)/,
    /(常规|全面|专项|入职|年度|复查|重点|症状|关注|目的|科室|方向)/,
    /(已有|已经|医院|机构|日期|时间|预约)/,
    /(陪同|陪检|项目|报告|解读|建档|全程|协助|挂号|号源)/,
    /(城市|北京|上海|广州|深圳|杭州|南京|成都|武汉|预算|价格)/,
  ].filter(pattern => pattern.test(customerText)).length;
  const disclaimer = '小嘉仅协助梳理服务需求并推荐平台已有服务，不提供诊断、治疗、处方或个性化健康方案。';

  if (needDimensions < 2) {
    const question = asksForCheckup
      ? '好的，想先了解一下：这次是您本人还是家人体检？是常规体检，还是有特别关注的方向或已有检查安排呢？'
      : '好的，想先了解一下：是您本人还是家人需要就医协助？目前想看哪个科室或重点解决什么就医需求呢？';
    return `${question}\n\n${disclaimer}`;
  }

  const servicePattern = asksForExpert
    ? /(约诊|挂号|专家预约|就医协助)/
    : /(体检|健康检查)/;
  const product = await Product.findOne({ status: 'on', name: servicePattern })
    .sort({ sortOrder: 1 })
    .select('name subtitle originalPrice servicePrices skus')
    .lean();
  if (asksForExpert) {
    if (!product) {
      return `我不能直接生成或推荐具体专家。目前没有查询到可核验的上架约诊服务；如您愿意，我可以为您转接专属健康规划师继续确认。\n\n${disclaimer}`;
    }
    return `您的需求适合平台已上架的「${product.name}」。请告诉我所在城市、医院或科室倾向、就诊方向和方便时间；后续由健康规划师协助匹配约诊资源。小嘉不会生成未经核验的专家姓名或号源。\n\n${disclaimer}`;
  }

  if (!product) {
    return `目前没有查询到可核验的上架体检服务，我不能自行制定体检方案或组合检查项目。如您愿意，我可以为您转接专属健康规划师继续确认。\n\n${disclaimer}`;
  }
  if (asksForPrice) {
    const prices = resolveProductPrices(product).map(option => Number(option.price)).filter(price => Number.isFinite(price) && price >= 0);
    const priceText = prices.length ? `目前平台显示的价格为${Math.min(...prices)}元起` : '具体价格以服务页面当前展示为准';
    return `您问的是「${product.name}」的收费。${priceText}；不同服务内容或规格可能有差异。如果您愿意，我也可以接着说明它具体包含哪些服务。\n\n${disclaimer}`;
  }
  return `您的需求适合平台已上架的「${product.name}」。我可以继续了解城市、时间和预算偏好，帮助您确认这项服务；具体检查项目由服务内容或专业人员确认，小嘉不自行制定体检方案。\n\n${disclaimer}`;
}

async function maybeCreateServiceProposal({ userId, messages, lastUserMsg }) {
  const userTurns = messages.filter(message => message.role === 'user');
  const ready = userTurns.length >= 2 && /(方案|推荐|适合|购买|下单|安排|需要什么服务|怎么做)/.test(lastUserMsg);
  if (!ready) return null;
  const existing = await ServiceProposal.findOne({ user: userId, status: 'pending', createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
  if (existing) return existing;
  const planner = await resolveHealthPlanner(userId);
  if (!planner) return null;
  const productCandidates = await Product.find({ status: 'on', 'aiProfile.enabledForRecommendation': true })
    .sort({ sortOrder: 1 }).limit(50)
    .select('_id name category subtitle originalPrice servicePrices skus features fulfillmentType bookingRequired deliveryRequired serviceLocation validityDays refundPolicy status aiProfile')
    .lean();
  const products = productCandidates.filter(isAiRecommendable);
  if (!products.length) return null;
  const catalog = products.map(buildAiCatalogEntry);
  const raw = await chat([
    { role: 'user', content: `对话：\n${messages.slice(-10).map(m => `${m.role === 'user' ? '客户' : '规划师'}：${m.content}`).join('\n')}\n\n当前允许 AI 推荐的实时服务目录（JSON）：\n${JSON.stringify(catalog)}` },
  ], {
    jsonMode: true, maxTokens: 1000,
    systemPrompt: '你是服务匹配助手。只能推荐目录中给定的产品，必须遵守适用/不适用、必问、地域、不可承诺和转人工规则；信息不足时不要推荐。不得制定方案、组合检查项目、创造套餐、推荐具体专家、诊断、治疗、开药或承诺资源和效果。通常推荐1项，最多2项。proposalText只概括客户原始需求和选择这些现有服务的理由，不得使用“方案”“定制”等词。输出JSON：customerNeed字符串、proposalText字符串（面向客户，200字内）、confidence数值0-1、recommendations数组，每项含productId、reason。',
  });
  const parsed = JSON.parse(raw);
  const productMap = new Map(products.map(product => [String(product._id), product]));
  const recommendations = (parsed.recommendations || []).map(item => {
    const product = productMap.get(String(item.productId));
    const price = product ? Math.min(...resolveProductPrices(product).map(option => option.price)) : 0;
    return product ? { productId: product._id, name: product.name, price, reason: String(item.reason || '') } : null;
  }).filter(Boolean);
  if (!recommendations.length) return null;
  return ServiceProposal.create({
    user: userId, planner, customerNeed: String(parsed.customerNeed || lastUserMsg),
    proposalText: String(parsed.proposalText || ''), confidence: Number(parsed.confidence) || 0,
    recommendedProducts: recommendations,
  });
}

// 拉取用户最近健康数据摘要
async function getUserDataContext(userId) {
  try {
    const records = await HealthRecord.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const latest = {};
    records.forEach(r => {
      if (!latest[r.type]) latest[r.type] = r;
    });

    const lines = [];
    if (latest.bloodPressure) {
      const r = latest.bloodPressure;
      lines.push(`血压：${r.extra?.sys || ''}/${r.extra?.dia || ''}mmHg（${new Date(r.createdAt).toLocaleDateString('zh-CN')}）`);
    }
    if (latest.bloodSugar) lines.push(`血糖：${latest.bloodSugar.value}mmol/L`);
    if (latest.heartRate)  lines.push(`心率：${latest.heartRate.value}次/分`);
    if (latest.weight)     lines.push(`体重：${latest.weight.value}kg`);
    if (latest.sleep)      lines.push(`睡眠：${latest.sleep.value}小时`);

    return lines.length ? `\n用户最新健康数据：\n${lines.join('\n')}` : '';
  } catch {
    return '';
  }
}

async function getFollowupContext(userId) {
  try {
    const [reminders, followups] = await Promise.all([
      Reminder.find({ user: userId, enabled: true, category: { $in: ['followup_abnormal', 'screening_annual'] } })
        .sort({ targetDate: 1 }).limit(8).lean(),
      FollowUp.find({ patientId: userId, status: { $in: ['planned', 'in_progress', 'missed'] } })
        .sort({ date: 1 }).limit(8).select('theme content date status tags').lean(),
    ]);
    const reminderLines = reminders.map(item => `${item.title}${item.targetDate ? `（目标日期${new Date(item.targetDate).toLocaleDateString('zh-CN')}）` : ''}${item.description ? `：${item.description}` : ''}`);
    const followupLines = followups.map(item => `${item.theme || '复查事项'}${item.date ? `（${new Date(item.date).toLocaleDateString('zh-CN')}）` : ''}${item.content ? `：${item.content}` : ''}`);
    const lines = [...reminderLines, ...followupLines];
    return lines.length ? `\n用户当前待处理复查事项（只能按原文协助办理，不得扩展检查项目）：\n${lines.join('\n')}` : '\n用户当前没有系统记录的待处理复查事项；如用户提出复查需求，应先确认提醒或医嘱来源。';
  } catch {
    return '';
  }
}

router.get('/config', auth, async (_req, res) => {
  try {
    const cfg = await getHealthAssistantConfig();
    const { behaviorPrompt, humanPresenceMinutes, ...publicConfig } = cfg;
    res.json({ success: true, data: publicConfig });
  } catch (err) { res.status(500).json({ success: false, message: '获取健康助手配置失败' }); }
});

router.get('/status', auth, async (req, res) => {
  try {
    const cfg = await getHealthAssistantConfig();
    const recentHumanReply = await Message.findOne({
      conversationId: { $in: [`${req.user._id}_manager`, `${req.user._id}_doctor`, `${req.user._id}_nutritionist`] },
      type: { $in: ['manager', 'doctor', 'nutritionist'] },
      isAI: { $ne: true },
      createdAt: { $gte: new Date(Date.now() - cfg.humanPresenceMinutes * 60 * 1000) },
    }).sort({ createdAt: -1 }).select('sender createdAt').lean();
    res.json({ success: true, data: {
      mode: recentHumanReply ? 'human' : 'ai',
      label: recentHumanReply ? cfg.humanOnlineLabel : cfg.aiOnlineLabel,
      staffName: recentHumanReply?.sender || '',
    } });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取在线状态失败' });
  }
});

// POST /api/chat — 主对话接口
router.post('/', auth, async (req, res) => {
  const { messages = [], userInfo = {}, image = '', mimeType = 'image/jpeg', audio = null } = req.body;
  const userId = req.user._id;
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || (audio?.data ? '[语音消息]' : image ? '[图片消息]' : '');
  const t0 = Date.now();

  if (!process.env.QWEN_API_KEY) {
    return res.status(503).json({ success: false, message: 'AI服务暂未开通，请联系管理员配置。' });
  }

  // 小嘉围绕复查办理与履约服务提供协助；是否配有专业团队都不改变非医疗边界。
  const me = await User.findById(userId).select('assignedFamilyDoctor');
  const hasDoctor = !!me?.assignedFamilyDoctor;

  const DAILY_LIMIT_NO_DOCTOR = 5;
  if (!hasDoctor) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayCount = await ChatLog.countDocuments({ user: userId, createdAt: { $gte: todayStart } });
    if (todayCount >= DAILY_LIMIT_NO_DOCTOR) {
      return res.status(429).json({ success: false, message: `今日AI服务咨询次数已达上限（${DAILY_LIMIT_NO_DOCTOR}次），请明天再来，或转接健康规划师继续处理` });
    }
  }

  // 意图识别
  const intent = detectIntent(lastUserMsg);

  let imageUrl = '';
  let audioUrl = '';
  let audioDuration = 0;
  if (image) {
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image) || image.length > 12 * 1024 * 1024) return res.status(400).json({ success:false, message:'图片格式不支持或文件过大' });
    imageUrl = (await uploadBase64(image, mimeType, 'chat')).url;
  }
  if (audio?.data) {
    if (String(audio.data).length > 12 * 1024 * 1024) return res.status(413).json({ success:false, message:'语音文件过大' });
    audioDuration = Math.max(1, Math.min(60, Number(audio.duration) || 1));
    audioUrl = (await uploadBase64(audio.data, audio.mimeType || 'audio/mpeg', 'chat/audio')).url;
  }

  // 专家约诊和体检属于高风险幻觉场景：只引用数据库中实际上架的服务，不交给模型自由生成。
  const verifiedServiceReply = await buildVerifiedServiceReply(lastUserMsg, messages);
  if (verifiedServiceReply) {
    const log = await ChatLog.create({ user: userId, intent: 'service', userMessage: lastUserMsg, aiReply: verifiedServiceReply });
    return res.json({ success: true, data: { content: verifiedServiceReply, intent: 'service', logId: log._id } });
  }

  // 超出范围直接返回
  if (intent === 'out_of_scope') {
    const reply = '这个问题属于医疗诊疗范畴，小嘉不能提供判断或建议。请前往正规医疗机构咨询执业医师；如情况紧急，请立即拨打120。小嘉仅协助梳理服务需求并推荐平台已有服务，不提供诊断、治疗、处方或个性化健康方案。';
    const log = await ChatLog.create({ user: userId, intent, userMessage: lastUserMsg, aiReply: reply });
    return res.json({ success: true, data: { content: reply, intent, logId: log._id } });
  }

  // 拼接系统提示
  const userContext = [
    userInfo.name  && `姓名：${userInfo.name}`,
  ].filter(Boolean).join('，');

  const [healthDataContext, followupContext, assistantConfig] = await Promise.all([
    getUserDataContext(userId),
    getFollowupContext(userId),
    getHealthAssistantConfig(),
  ]);
  const scopeNotice = `\n【角色边界】你可以使用系统提供的复查事项和日常健康记录帮助会员把复查流程办妥，但只能陈述客观记录与变化，不得诊断、推断病情、开检查项目、制定治疗或调整用药。服务只能从平台实时上架目录中推荐。`;

  const systemPrompt = [
    BASE_SYSTEM,
    `\n【后台运营配置】助手名称：${assistantConfig.plannerName}\n${assistantConfig.behaviorPrompt}\n转人工提示：${assistantConfig.transferText}\n免责声明：${assistantConfig.disclaimer}`,
    scopeNotice,
    userContext ? `\n用户基本信息：${userContext}` : '',
    followupContext,
    healthDataContext,
  ].join('');

  // 格式化历史消息：最近10条，且只取24小时内的（避免几天前的话题被当作当前场景误关联）。
  // 每条历史消息前标注日期，让模型自己判断是否与当前问题相关，而不是靠"条数"这种和时间无关的截断。
  const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const chatMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .filter(m => !m.time || now - new Date(m.time).getTime() <= HISTORY_WINDOW_MS)
    .slice(-10)
    .map(m => {
      const dateTag = m.time ? `[${new Date(m.time).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}] ` : '';
      return { role: m.role, content: dateTag + String(m.content) };
    });

  if (audioUrl && chatMessages.length) chatMessages[chatMessages.length - 1].content = '[用户发送了一条语音。为避免语音识别造成健康信息误差，请温和确认收到，并请用户补充一句文字重点。]';
  if (imageUrl && chatMessages.length) chatMessages[chatMessages.length - 1].content += '\n[用户同时上传了一张图片，请仅确认收到并围绕健康管理事项交流，不作诊断或医学判断。]';

  if (!chatMessages.length || chatMessages[chatMessages.length - 1].role !== 'user') {
    return res.status(400).json({ success: false, message: '消息格式错误' });
  }

  try {
    const rawReplyText = await chat(chatMessages, { systemPrompt, maxTokens: 600 });
    const replyText = guardUnsupportedCapabilityClaims(rawReplyText);
    const durationMs = Date.now() - t0;

    // 需要拿到 _id 返回给前端才能支持"当场撤回"（撤回按 logId 定位 ChatLog 记录）
    const log = await ChatLog.create({ user: userId, intent, userMessage: lastUserMsg, aiReply: replyText, imageUrl, audioUrl, audioDuration, durationMs });
    let proposal = null;
    if (intent === 'service') {
      try { proposal = await maybeCreateServiceProposal({ userId, messages, lastUserMsg }); }
      catch (proposalError) { console.error('Service proposal draft error:', proposalError.message); }
    }

    res.json({ success: true, data: { content: proposal ? `${replyText}\n\n我已把您的服务需求和可选服务提交给专属健康规划师确认。` : replyText, intent, logId: log._id, imageUrl, audioUrl, audioDuration, proposalPending: !!proposal } });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ success: false, message: `AI响应失败，请稍后重试。（${err.message}）` });
  }
});

// POST /api/chat/nutrition — AI营养师：支持饮食文字、体重和单张饮食照片。
// 图片只做食物与份量的保守估算；确定性体重数值同时写入健康记录，便于后续趋势分析。
router.post('/nutrition', auth, async (req, res) => {
  const { text = '', weight, image = '', mimeType = 'image/jpeg', mealType = '', recordId = '', saveRecord = false } = req.body || {};
  const cleanText = String(text || '').trim().slice(0, 1000);
  const numericWeight = weight === '' || weight === undefined || weight === null ? null : Number(weight);
  const hasImage = typeof image === 'string' && image.length > 0;
  if (!cleanText && numericWeight === null && !hasImage) {
    return res.status(400).json({ success: false, message: '请填写饮食内容、体重或上传饮食照片' });
  }
  if (numericWeight !== null && (!Number.isFinite(numericWeight) || numericWeight < 20 || numericWeight > 300)) {
    return res.status(400).json({ success: false, message: '请输入20–300kg之间的有效体重' });
  }
  if (hasImage) {
    if (!/^data:image\/(jpeg|jpg|png|webp|heic|heif);base64,/i.test(image)) {
      return res.status(400).json({ success: false, message: '仅支持 JPG、PNG、WEBP 或 HEIC 饮食照片' });
    }
    if (image.length > 12 * 1024 * 1024) {
      return res.status(413).json({ success: false, message: '图片过大，请压缩到8MB以内后重试' });
    }
  }
  if (!process.env.QWEN_API_KEY) {
    return res.status(503).json({ success: false, message: 'AI营养分析服务暂未开通' });
  }

  const t0 = Date.now();
  try {
    const existingRecord = recordId
      ? await HealthRecord.findOne({ _id: recordId, user: req.user._id })
      : null;
    if (recordId && !existingRecord) return res.status(404).json({ success: false, message: '健康记录不存在' });
    const user = await User.findById(req.user._id)
      .select('name age gender height weight chronicDiseases healthProfile healthConcern assignedNutritionist clientBrand');
    const context = nutritionUserContext(user || {});
    const inputDescription = [
      cleanText && `客户描述：${cleanText}`,
      numericWeight !== null && `客户本次体重：${numericWeight}kg`,
      mealType && `餐次：${String(mealType).slice(0, 20)}`,
      context && `客户档案：${context}`,
    ].filter(Boolean).join('\n');
    const prompt = `${NUTRITION_SYSTEM}\n\n${inputDescription || '客户仅上传了饮食照片，请识别照片中的餐食。'}`;
    const raw = hasImage
      ? await parseImage(image, prompt, { isUrl: false, model: 'qwen-vl-plus', maxTokens: 1400, timeoutMs: 60000 })
      : await chat([{ role: 'user', content: inputDescription }], { systemPrompt: NUTRITION_SYSTEM, jsonMode: true, maxTokens: 1400 });
    const analysis = parseAiJson(raw);
    const safeAnalysis = {
      mealSummary: String(analysis.mealSummary || '').slice(0, 300),
      foods: Array.isArray(analysis.foods) ? analysis.foods.slice(0, 20) : [],
      calorieMin: Number(analysis.calorieMin) || 0,
      calorieMax: Number(analysis.calorieMax) || 0,
      protein: String(analysis.protein || '未知').slice(0, 100),
      carbs: String(analysis.carbs || '未知').slice(0, 100),
      fat: String(analysis.fat || '未知').slice(0, 100),
      assessment: String(analysis.assessment || '').slice(0, 500),
      suggestions: Array.isArray(analysis.suggestions) ? analysis.suggestions.slice(0, 6).map(String) : [],
      questions: Array.isArray(analysis.questions) ? analysis.questions.slice(0, 4).map(String) : [],
      riskFlags: Array.isArray(analysis.riskFlags) ? analysis.riskFlags.slice(0, 6).map(String) : [],
      confidence: ['high', 'medium', 'low'].includes(analysis.confidence) ? analysis.confidence : 'low',
    };
    const reply = String(analysis.reply || [safeAnalysis.mealSummary, safeAnalysis.assessment, ...safeAnalysis.suggestions].filter(Boolean).join('\n')).slice(0, 1200)
      || '已收到您的记录，但当前信息不足以可靠估算，请补充食物名称和大致份量。';

    let imageUrl = '';
    if (hasImage && process.env.OSS_ACCESS_KEY_ID) {
      try {
        const uploaded = await uploadBase64(image, mimeType, 'nutrition');
        imageUrl = uploaded.url;
      } catch (uploadError) {
        console.error('Nutrition image upload error:', uploadError.message);
      }
    }

    const records = [];
    if (saveRecord && numericWeight !== null && existingRecord?.type === 'weight') {
      existingRecord.extra = { ...(existingRecord.extra || {}), nutritionAnalysis: safeAnalysis };
      await existingRecord.save();
      records.push(existingRecord);
      await User.updateOne({ _id: req.user._id }, { $set: { weight: numericWeight } });
    } else if (saveRecord && numericWeight !== null) {
      records.push(await HealthRecord.create({
        user: req.user._id, category: 'metabolism', type: 'weight', label: '体重',
        value: String(numericWeight), unit: 'kg', status: 'normal', note: cleanText,
        recordedAt: new Date(), recordedBy: { source: 'customer' },
      }));
      await User.updateOne({ _id: req.user._id }, { $set: { weight: numericWeight } });
    }
    if (saveRecord && (hasImage || cleanText) && existingRecord?.type === 'diet') {
      existingRecord.extra = { ...(existingRecord.extra || {}), imageUrl: imageUrl || existingRecord.extra?.imageUrl || '', mealType: mealType || existingRecord.extra?.mealType || '', nutritionAnalysis: safeAnalysis };
      existingRecord.imageUrl = imageUrl || existingRecord.imageUrl || '';
      existingRecord.status = safeAnalysis.riskFlags.length ? 'warning' : 'normal';
      await existingRecord.save();
      records.push(existingRecord);
    } else if (saveRecord && (hasImage || cleanText)) {
      records.push(await HealthRecord.create({
        user: req.user._id, category: 'lifestyle', type: 'diet', label: '饮食记录',
        value: safeAnalysis.mealSummary || cleanText || '饮食照片', unit: '', note: cleanText,
        imageUrl, extra: { imageUrl, mealType, nutritionAnalysis: safeAnalysis },
        status: safeAnalysis.riskFlags.length ? 'warning' : 'normal', recordedAt: new Date(),
        recordedBy: { source: 'customer' },
      }));
    }
    const userMessage = [cleanText, numericWeight !== null ? `体重${numericWeight}kg` : '', hasImage ? '[饮食照片]' : ''].filter(Boolean).join('；');
    const log = await ChatLog.create({
      user: req.user._id, role: 'nutritionist', intent: 'nutrition', userMessage,
      aiReply: reply, imageUrl, structuredData: safeAnalysis, durationMs: Date.now() - t0,
    });

    res.json({ success: true, data: {
      content: reply, analysis: safeAnalysis, imageUrl, logId: log._id,
      recordIds: records.map(record => record._id), needsHumanReview: safeAnalysis.riskFlags.length > 0,
      nutritionistAssigned: !!user?.assignedNutritionist,
    } });
  } catch (err) {
    console.error('Nutrition analysis error:', err.message);
    res.status(500).json({ success: false, message: `营养分析失败，请稍后重试。（${err.message}）` });
  }
});

// POST /api/chat/transfer — 转人工，落库为待办，专属健康规划师在 ai-todos 列表可见（transfer_human 场景），
// 同时把最近几轮AI聊天摘要注入人工对话（Message，manager频道），避免会员重新描述问题
router.post('/transfer', auth, async (req, res) => {
  const { lastMessage = '' } = req.body;
  try {
    const planner = await resolveHealthPlanner(req.user._id);
    if (!planner) {
      return res.status(409).json({ success: false, message: '暂未匹配到可接单的健康规划师，请稍后重试或联系客服。' });
    }
    await ChatLog.create({
      user: req.user._id,
      role: 'transfer',
      intent: 'out_of_scope',
      userMessage: lastMessage,
      aiReply: '',
      transferred: true,
      resolved: false,
    });

    // 取最近5轮AI对话组装摘要，作为system消息插入manager会话，健管打开"发消息"对话框即可看到上下文
    const recentLogs = await ChatLog.find({ user: req.user._id, role: { $ne: 'transfer' } })
      .sort({ createdAt: -1 }).limit(5).lean();
    const historyLines = recentLogs.reverse()
      .map(l => `会员：${l.userMessage}\n小嘉：${l.aiReply}`)
      .join('\n\n');
    await Message.create({
      user: req.user._id,
      type: 'system',
      sender: '系统',
      title: 'AI对话转人工',
      content: historyLines
        ? `会员从AI健康规划师转来，以下是此前需求梳理摘要：\n\n${historyLines}\n\n会员当前需求：${lastMessage}`
        : `会员从小嘉转来，请继续了解需求并推荐合适的平台服务：${lastMessage}`,
      conversationId: `${req.user._id}_manager`,
    });

    await User.findByIdAndUpdate(req.user._id, { assignedHealthPlanner: planner });
    res.json({
      success: true,
      message: '已转接您的专属健康规划师。规划师可以看到本次对话内容，并将在工作台中继续处理。',
    });
  } catch (err) {
    console.error('Chat transfer error:', err.message);
    res.status(500).json({ success: false, message: '转接失败，请稍后重试或直接拨打客服电话。' });
  }
});

// GET /api/chat/logs/:userId — 查看自己的对话记录（只能查自己）
// 医护端查看会员记录请走 staff 路由（待接入）
router.get('/logs/:userId', auth, async (req, res) => {
  if (req.user._id.toString() !== req.params.userId) {
    return res.status(403).json({ success: false, message: '无权访问' });
  }
  try {
    const logs = await ChatLog.find({ user: req.params.userId, recalled: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/chat/logs/:id/recall — 撤回一轮问答（仅本人，2分钟内可撤回）
const RECALL_WINDOW_MS = 2 * 60 * 1000;
router.patch('/logs/:id/recall', auth, async (req, res) => {
  try {
    const log = await ChatLog.findById(req.params.id);
    if (!log) return res.status(404).json({ success: false, message: '记录不存在' });
    if (log.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: '无权操作' });
    }
    if (log.recalled) return res.json({ success: true, message: '已撤回' });
    if (Date.now() - log.createdAt.getTime() > RECALL_WINDOW_MS) {
      return res.status(400).json({ success: false, message: '超过2分钟，无法撤回' });
    }
    log.recalled = true;
    log.recalledAt = new Date();
    await log.save();
    res.json({ success: true, message: '已撤回' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
