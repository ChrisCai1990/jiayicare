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
const { resolveHealthPlanner } = require('../utils/healthPlannerAssignment');
const router = express.Router();

const BASE_SYSTEM = `你是「小嘉」，嘉医汇健康管理平台的AI健康规划师。你的角色类似服务顾问：帮助会员梳理健康管理需求、明确阶段目标、介绍平台服务内容、规划服务步骤，并在需要时转接人工健康管理专员。

回答要求：
1. 使用中文，语气温和专业
2. 回答控制在200字以内，简洁精准
3. 先询问会员希望改善的问题、期望目标、可投入时间和服务偏好，再给出健康管理需求清单与建议服务路径
4. 可以介绍健康档案整理、体检信息整理、生活方式管理、健康提醒、复查提醒和就医协助，但不得把某项服务描述为医疗诊断或治疗
5. 不提供疾病诊断、治疗方案、处方、线上复诊、检查开单、药品推荐、停换药或剂量调整，不解读症状来判断疾病
6. 遇到医疗问题，简短说明超出服务范围，建议前往正规医疗机构；遇到胸痛、呼吸困难、意识障碍等紧急情况，提示立即拨打120
7. 不捏造会员信息，不制造焦虑，不承诺疗效，不使用“治愈”“治疗”“保证改善”等表述
8. 服务推荐必须说明推荐理由，由会员自主选择，不得诱导购买高价套餐
9. 每次回答末尾加：「小嘉仅提供健康管理需求梳理与服务规划，不提供诊断、治疗或处方。」
10. 只能介绍平台已经上线的能力。当前对话支持文字回复、语音播报和转人工，不支持把对话内容导出或下载为文件，不支持生成图文版/PDF，也不支持直接微信推送。不得承诺、暗示或规划这些未上线能力；会员询问时应如实说明暂不支持`;

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

async function maybeCreateServiceProposal({ userId, messages, lastUserMsg }) {
  const userTurns = messages.filter(message => message.role === 'user');
  const ready = userTurns.length >= 2 && /(方案|推荐|适合|购买|下单|安排|需要什么服务|怎么做)/.test(lastUserMsg);
  if (!ready) return null;
  const existing = await ServiceProposal.findOne({ user: userId, status: 'pending', createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
  if (existing) return existing;
  const planner = await resolveHealthPlanner(userId);
  if (!planner) return null;
  const products = await Product.find({ status: 'on' }).sort({ sortOrder: 1 }).limit(30).select('_id name subtitle originalPrice servicePrices memberPrices features').lean();
  if (!products.length) return null;
  const raw = await chat([
    { role: 'user', content: `对话：\n${messages.slice(-10).map(m => `${m.role === 'user' ? '客户' : '规划师'}：${m.content}`).join('\n')}\n\n当前可售服务：\n${products.map(p => `${p._id}|${p.name}|${p.subtitle || ''}|参考价${p.originalPrice || 0}|${(p.features || []).join('、')}`).join('\n')}` },
  ], {
    jsonMode: true, maxTokens: 1000,
    systemPrompt: '你是服务方案草稿生成器。只能推荐给定的在售服务，不提供诊断、治疗或处方。输出JSON：customerNeed字符串、proposalText字符串（面向客户，300字内）、confidence数值0-1、recommendations数组，每项含productId、reason。',
  });
  const parsed = JSON.parse(raw);
  const productMap = new Map(products.map(product => [String(product._id), product]));
  const recommendations = (parsed.recommendations || []).map(item => {
    const product = productMap.get(String(item.productId));
    return product ? { productId: product._id, name: product.name, price: product.originalPrice || 0, reason: String(item.reason || '') } : null;
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

// POST /api/chat — 主对话接口
router.post('/', auth, async (req, res) => {
  const { messages = [], userInfo = {} } = req.body;
  const userId = req.user._id;
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const t0 = Date.now();

  if (!process.env.QWEN_API_KEY) {
    return res.status(503).json({ success: false, message: 'AI服务暂未开通，请联系管理员配置。' });
  }

  // AI健康规划师仅承担需求梳理与服务规划；是否配有专业团队都不改变非医疗边界。
  const me = await User.findById(userId).select('assignedFamilyDoctor aiHealthSummary aiRiskAssessment');
  const hasDoctor = !!me?.assignedFamilyDoctor;

  const DAILY_LIMIT_NO_DOCTOR = 5;
  if (!hasDoctor) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayCount = await ChatLog.countDocuments({ user: userId, createdAt: { $gte: todayStart } });
    if (todayCount >= DAILY_LIMIT_NO_DOCTOR) {
      return res.status(429).json({ success: false, message: `今日AI规划次数已达上限（${DAILY_LIMIT_NO_DOCTOR}次），请明天再来，或联系健康管理专员继续梳理需求` });
    }
  }

  // 意图识别
  const intent = detectIntent(lastUserMsg);

  // 超出范围直接返回
  if (intent === 'out_of_scope') {
    const reply = '这个问题属于医疗诊疗范畴，小嘉不能提供判断或建议。请前往正规医疗机构咨询执业医师；如情况紧急，请立即拨打120。小嘉仅提供健康管理需求梳理与服务规划，不提供诊断、治疗或处方。';
    const log = await ChatLog.create({ user: userId, intent, userMessage: lastUserMsg, aiReply: reply });
    return res.json({ success: true, data: { content: reply, intent, logId: log._id } });
  }

  // 数据查询类：附上健康数据
  let dataContext = '';
  if (intent === 'data') {
    dataContext = await getUserDataContext(userId);
  }

  // 拼接系统提示
  const userContext = [
    userInfo.name  && `姓名：${userInfo.name}`,
    userInfo.age   && `年龄：${userInfo.age}岁`,
    userInfo.gender && userInfo.gender !== '未知' && `性别：${userInfo.gender}`,
    userInfo.conditions && `既往病史：${userInfo.conditions}`,
    userInfo.medications && `用药：${userInfo.medications}`,
  ].filter(Boolean).join('，');

  const scopeNotice = `\n【角色边界】无论会员是否配有专业服务团队，你都只能进行健康管理需求梳理、服务规划与平台服务介绍。健康资料只能用于判断可能需要哪类非医疗健康管理支持，不能用于疾病判断、诊疗建议或用药指导。`;

  const systemPrompt = [
    BASE_SYSTEM,
    scopeNotice,
    userContext ? `\n用户基本信息：${userContext}` : '',
    buildHealthInsightContext(me),
    dataContext,
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

  if (!chatMessages.length || chatMessages[chatMessages.length - 1].role !== 'user') {
    return res.status(400).json({ success: false, message: '消息格式错误' });
  }

  try {
    const rawReplyText = await chat(chatMessages, { systemPrompt, maxTokens: 600 });
    const replyText = guardUnsupportedCapabilityClaims(rawReplyText);
    const durationMs = Date.now() - t0;

    // 需要拿到 _id 返回给前端才能支持"当场撤回"（撤回按 logId 定位 ChatLog 记录）
    const log = await ChatLog.create({ user: userId, intent, userMessage: lastUserMsg, aiReply: replyText, durationMs });
    let proposal = null;
    if (intent === 'service') {
      try { proposal = await maybeCreateServiceProposal({ userId, messages, lastUserMsg }); }
      catch (proposalError) { console.error('Service proposal draft error:', proposalError.message); }
    }

    res.json({ success: true, data: { content: proposal ? `${replyText}\n\n我已为您整理服务方案，正在由专属健康规划师审核。` : replyText, intent, logId: log._id, proposalPending: !!proposal } });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ success: false, message: `AI响应失败，请稍后重试。（${err.message}）` });
  }
});

// POST /api/chat/nutrition — AI营养师：支持饮食文字、体重和单张饮食照片。
// 图片只做食物与份量的保守估算；确定性体重数值同时写入健康记录，便于后续趋势分析。
router.post('/nutrition', auth, async (req, res) => {
  const { text = '', weight, image = '', mimeType = 'image/jpeg', mealType = '', recordId = '' } = req.body || {};
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
    if (numericWeight !== null && existingRecord?.type === 'weight') {
      existingRecord.extra = { ...(existingRecord.extra || {}), nutritionAnalysis: safeAnalysis };
      await existingRecord.save();
      records.push(existingRecord);
      await User.updateOne({ _id: req.user._id }, { $set: { weight: numericWeight } });
    } else if (numericWeight !== null) {
      records.push(await HealthRecord.create({
        user: req.user._id, category: 'metabolism', type: 'weight', label: '体重',
        value: String(numericWeight), unit: 'kg', status: 'normal', note: cleanText,
        recordedAt: new Date(), recordedBy: { source: 'customer' },
      }));
      await User.updateOne({ _id: req.user._id }, { $set: { weight: numericWeight } });
    }
    if ((hasImage || cleanText) && existingRecord?.type === 'diet') {
      existingRecord.extra = { ...(existingRecord.extra || {}), imageUrl: imageUrl || existingRecord.extra?.imageUrl || '', mealType: mealType || existingRecord.extra?.mealType || '', nutritionAnalysis: safeAnalysis };
      existingRecord.imageUrl = imageUrl || existingRecord.imageUrl || '';
      existingRecord.status = safeAnalysis.riskFlags.length ? 'warning' : 'normal';
      await existingRecord.save();
      records.push(existingRecord);
    } else if (hasImage || cleanText) {
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

// POST /api/chat/transfer — 转人工，落库为待办，健管专员在 ai-todos 待审核列表可见（transfer_human 场景），
// 同时把最近几轮AI聊天摘要注入到健管的人工对话（Message，manager频道），避免会员需要重新描述一遍问题
router.post('/transfer', auth, async (req, res) => {
  const { lastMessage = '' } = req.body;
  try {
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
        : `会员从AI健康规划师转来人工服务规划：${lastMessage}`,
      conversationId: `${req.user._id}_manager`,
    });

    const hasManager = !!(await User.findById(req.user._id).select('assignedHealthManager').lean())?.assignedHealthManager;
    res.json({
      success: true,
      message: hasManager
        ? '已通知健管专员，稍后将有专员与您联系。'
        : '已记录您的咨询，客服会尽快为您安排专员对接。',
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
