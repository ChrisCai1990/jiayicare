const Message = require('../models/Message');
const User = require('../models/User');
const FollowUp = require('../models/FollowUp');
const MedicalReport = require('../models/MedicalReport');
const ChatConversationState = require('../models/ChatConversationState');
const { chat } = require('./ai');

let _ssePublish = null;
function ssePublish(...args) { if (!_ssePublish) { try { _ssePublish = require('../routes/messages').ssePublish; } catch {} } _ssePublish?.(...args); }

// AI消息即时兜底回复：用户给健康顾问/营养师/健管专员留言后，AI立即先回一句安抚，
// 明确不涉及诊断/治疗建议；医护看到后仍可正常人工回复追加，不覆盖AI这条。
const TITLE_MAP = { doctor: '健康顾问', nutritionist: '营养师', manager: '健管专员' };
const SENDER_MAP = { doctor: 'AI健康助手（代健康顾问）', nutritionist: 'AI健康助手（代营养师）', manager: 'AI健康助手（代健管专员）' };

const FULL_DISCLAIMER = '';
const SHORT_DISCLAIMER = '';

// 得到客户称呼：优先用医护标注的 preferredTitle，否则按性别得体兜底（男→先生 / 女→女士 / 未知→姓名）
function resolveTitle(user) {
  if (user?.preferredTitle && user.preferredTitle.trim()) return user.preferredTitle.trim();
  const surname = (user?.name || '').trim().charAt(0);
  if (user?.gender === '男') return surname ? `${surname}先生` : (user.name || '您');
  if (user?.gender === '女') return surname ? `${surname}女士` : (user.name || '您');
  return user?.name || '您';
}

function buildSystemPrompt(isFirstAIReply, title, healthContext = '') {
  return `你是嘉医汇健康管理平台中该服务人员自己的AI在线助手。你的任务是直接接住用户当下的话题，陪用户自然聊天并提供情绪价值。当前用户称呼："${title}"。

要求：
1. 开口称呼用户为"${title}"（自然融入，不用每句都喊，别生硬），用中文，语气自然温和、有真实的情感温度，像真人在关心地聊天
2. ${isFirstAIReply ? '这是本次对话的第一条回复，简要打个招呼即可，不用说"已收到留言/已记录/会跟进/会分析"这类话——用户每条消息健康顾问/营养师/健管专员本来就都会看到，不需要反复强调' : '直接针对用户这句话的内容自然接话，绝对不要出现"已记录""已为您记录""会结合情况分析""会及时跟进"这类重复的客套尾巴'}
3. 用户表达情绪（开心、担心、感谢、抱怨等）时要先回应情绪本身，再接话，让对方感觉真的被关心，不要只回信息不回感情
4. 你的重点是倾听、安抚和提供情绪价值。仅在用户问到时，可客观复述下方已经确认的健康档案、报告名称/日期和复查提醒；严禁对数据作判断、解读或评价，严禁给出诊断、治疗、用药调整、检查选择、就医科室或方案建议
5. 控制在80字以内，简洁自然，不要写成客服话术
6. 你只属于当前频道对应的这位服务人员，不存在转交给其他任何人。不要提议、承诺或描述转接、转交、协调其他岗位，也不要重复免责声明
7. 绝对不要描述、猜测或汇报真人正在做什么，不要说真人忙、接待其他客户、诊疗中或稍后回复
8. 用户问“在吗”“忙吗”“有人吗”时，直接自然回应，例如“在的，怎么啦？”“我在呢，您说”，然后顺着用户接下来的内容聊
9. 紧急情况只提示立即拨打120，或直接电话联系本频道对应的服务人员，不要转给其他岗位
10. 聚焦用户最新一句和当下需求。历史消息只用于理解代词和紧邻上下文；用户明确说某事已过去、没发生或更正前文时，立即以最新说法为准，不延续旧话题
11. 每条历史消息前有准确时间。跨天或相隔6小时以上视为新一轮交流，除非用户主动提起，否则不要把旧话题带入当前回复

可客观引用的已确认资料（没有内容就不要主动提及；不得据此推断）：
${healthContext || '暂无可引用资料'}`;
}

async function buildHealthContext(userId) {
  const [user, reports, followUps] = await Promise.all([
    User.findById(userId).select('healthProfile bodyComposition').lean(),
    MedicalReport.find({ user: userId, audit_status: 'audited' }).sort({ date: -1, createdAt: -1 }).limit(5).select('title date checkDate').lean(),
    FollowUp.find({ patientId: userId, status: { $in: ['planned', 'in_progress'] }, date: { $gte: new Date() } }).sort({ date: 1 }).limit(5).select('date theme plannedContent tags').lean(),
  ]);
  const lines = [];
  if (user?.healthProfile && Object.keys(user.healthProfile).length) lines.push(`健康档案：${JSON.stringify(user.healthProfile)}`);
  if (user?.bodyComposition && Object.keys(user.bodyComposition).length) lines.push(`身体成分记录：${JSON.stringify(user.bodyComposition)}`);
  if (reports.length) lines.push(`已审核报告：${reports.map(r => `${r.title}（${r.checkDate || r.date || '日期未记录'}）`).join('；')}`);
  if (followUps.length) lines.push(`待办/复查提醒：${followUps.map(f => `${f.theme || f.plannedContent || f.tags?.join('、') || '随访'}（${new Date(f.date).toISOString().slice(0, 10)}）`).join('；')}`);
  return lines.join('\n').slice(0, 4000);
}

// 供 messages.js 在用户发送留言后异步调用，不阻塞发送响应
async function replyWithAI({ userId, recipient, content, conversationId }) {
  try {
    // 人工接手后 AI 必须静默。生成前后各检查一次，覆盖生成期间人工刚接手的并发场景。
    if (await ChatConversationState.exists({ conversationId, humanActive: true })) return;
    const [history, user, healthContext] = await Promise.all([
      Message.find({ conversationId, recalled: { $ne: true } }).sort({ createdAt: -1 }).limit(20).select('type content createdAt').lean(),
      User.findById(userId).select('name gender preferredTitle').lean(),
      buildHealthContext(userId),
    ]);

    history.reverse();
    // 只保留与最新一条连续的对话段；长时间前的旧话题不参与本轮推理。
    let segmentStart = 0;
    for (let i = history.length - 1; i > 0; i -= 1) {
      if (new Date(history[i].createdAt) - new Date(history[i - 1].createdAt) > 6 * 60 * 60 * 1000) {
        segmentStart = i;
        break;
      }
    }
    const recentHistory = history.slice(segmentStart).slice(-12);
    const isFirstAIReply = !recentHistory.some(m => m.type !== 'user');
    const disclaimer = isFirstAIReply ? FULL_DISCLAIMER : SHORT_DISCLAIMER;
    const title = resolveTitle(user);
    const systemPrompt = buildSystemPrompt(isFirstAIReply, title, healthContext);

    const chatMessages = recentHistory.map(m => ({
      role: m.type === 'user' ? 'user' : 'assistant',
      content: `[${new Date(m.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}] ${m.content.replace(FULL_DISCLAIMER, '').replace(SHORT_DISCLAIMER, '').trim()}`,
    }));
    const replyText = await chat(chatMessages, { systemPrompt, maxTokens: 300 });
    if (await ChatConversationState.exists({ conversationId, humanActive: true })) return;
    const aiMsg = await Message.create({
      user: userId,
      type: recipient,
      sender: SENDER_MAP[recipient] || 'AI健康规划师',
      title: `${TITLE_MAP[recipient] || ''}AI先为您解答`,
      content: `${replyText}\n${disclaimer}`,
      unread: true,
      conversationId,
      isAI: true,
    });
    ssePublish(conversationId, { type: 'message', data: aiMsg });
  } catch (e) {
    console.error('[ai-msg-fallback] 会话 ' + conversationId + ' AI兜底回复失败', e.message);
  }
}

module.exports = { replyWithAI, buildSystemPrompt };
