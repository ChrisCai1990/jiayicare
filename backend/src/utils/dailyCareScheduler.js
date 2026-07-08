const User = require('../models/User');
const HealthRecord = require('../models/HealthRecord');
const Message = require('../models/Message');
const SystemConfig = require('../models/SystemConfig');

// AI 每日健康关怀：每天给活跃客户生成一条 AI 专属关怀/提醒消息，带「去打卡」入口，
// 目的是把系统从"等客户来"变成"主动关心客户"，提升打开率与打卡留存。
// 复用场景九 AI 教练消息的逻辑（读打卡→算依从性→AI 生成温暖话术），做成定时批量。
// 失败兜底：AI 不可用时用预设暖心模板，保证每天都能触达，不因 AI 挂掉而静默。

// 计算某客户近 14 天的连续打卡天数与距上次打卡天数
async function calcAdherence(userId) {
  const since = new Date(Date.now() - 14 * 86400000);
  const records = await HealthRecord.find({ user: userId, recordedAt: { $gte: since } })
    .sort({ recordedAt: -1 }).select('recordedAt').lean();
  const dayset = new Set(records.map(r => String(r.recordedAt).slice(0, 10)));
  let streak = 0;
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    if (dayset.has(d)) streak++;
    else if (i > 0) break;
    else continue;
  }
  const daysSinceLast = records.length
    ? Math.floor((Date.now() - new Date(records[0].recordedAt)) / 86400000)
    : 999;
  return { streak, daysSinceLast, hasAnyRecord: records.length > 0 };
}

// 预设暖心模板（AI 不可用时兜底），按依从性区分语气
function fallbackMessage(user, adh) {
  const name = user.name || '您';
  if (adh.daysSinceLast >= 3) {
    return `${name}，好几天没见您打卡啦～花一分钟记录下今天的身体状况吧，我们一直在关注您的健康 💚`;
  }
  if (adh.streak >= 7) {
    return `${name}，已经连续打卡 ${adh.streak} 天，太棒了！坚持记录让健康看得见，今天也别忘了哦 🌿`;
  }
  return `${name}，今天感觉怎么样？记得记录一下健康数据，小小的坚持会带来大大的改变 ☀️`;
}

async function generateCareMessage(user) {
  const adh = await calcAdherence(user._id);
  let tone;
  if (adh.daysSinceLast >= 3) tone = '提醒';
  else if (adh.streak >= 3) tone = '鼓励';
  else tone = '关心';

  try {
    const { chat } = require('./ai');
    const prompt = `你是一位温暖、专业的健康教练，请给会员发一条${tone}消息（40-80字，口语化、有温度、不说教，可用1个emoji，不要分点，不要出现"作为AI"之类的字样）。

【会员】${user.name}，慢病标签：${user.chronicDiseases?.join('、') || '无'}
【打卡情况】连续打卡 ${adh.streak} 天，距上次打卡 ${adh.daysSinceLast >= 999 ? '很久' : adh.daysSinceLast + ' 天'}
【消息基调】${tone}

请直接输出消息正文。`;
    const message = await chat([{ role: 'user', content: prompt }], { maxTokens: 300 });
    const text = (message || '').trim();
    if (text) return text;
  } catch (e) {
    console.error('[daily-care] AI 生成失败，用兜底模板：' + user.name, e.message);
  }
  return fallbackMessage(user, adh);
}

async function scanAndSendDailyCare() {
  // 开关：SystemConfig.dailyCare.enabled 为 false 则不发（默认开启）
  let enabled = true;
  try {
    const cfg = await SystemConfig.findOne({ key: 'dailyCare' }).lean();
    if (cfg && cfg.value && cfg.value.enabled === false) enabled = false;
  } catch (e) { /* 无配置表也不阻塞，默认开启 */ }
  if (!enabled) { console.log('[daily-care] 已被管理员关闭，跳过'); return; }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  // 只发给「近30天有过打卡」或「近30天新建档」的活跃客户，避免给僵尸账号发无效消息
  const activeUserIds = await HealthRecord.distinct('user', { recordedAt: { $gte: thirtyDaysAgo } });
  const recentUsers = await User.find({ createdAt: { $gte: thirtyDaysAgo } }).select('_id').lean();
  const candidateIds = [...new Set([...activeUserIds.map(String), ...recentUsers.map(u => String(u._id))])];

  let sent = 0;
  for (const uid of candidateIds) {
    try {
      // 防重复：今天已发过关怀就跳过
      const exists = await Message.findOne({
        user: uid, type: 'system', title: '今日健康关怀', createdAt: { $gt: oneDayAgo },
      });
      if (exists) continue;
      const user = await User.findById(uid).select('name gender age chronicDiseases').lean();
      if (!user) continue;

      const content = await generateCareMessage(user);
      await Message.create({
        user: uid,
        type: 'system',
        sender: 'AI健康助手',
        title: '今日健康关怀',
        content,
        unread: true,
        action: { type: 'checkin', route: 'AddRecord' }, // 客户端消息中心据此显「去打卡」按钮
      });
      sent++;
    } catch (e) {
      console.error('[daily-care] 客户 ' + uid + ' 关怀发送失败', e.message);
    }
  }
  if (sent > 0) console.log(`[daily-care] 已为 ${sent} 位客户发送今日健康关怀`);
}

// 每天扫描一次（与其它调度器一致）。启动时先跑一次，之后每 24h。
// 注：因是"每天最多一条"+防重复判断，即使重启导致一天内多次触发也不会重复发。
function startDailyCareScheduler() {
  scanAndSendDailyCare().catch(e => console.error('[daily-care] 首次扫描失败', e.message));
  setInterval(() => {
    scanAndSendDailyCare().catch(e => console.error('[daily-care] 定时扫描失败', e.message));
  }, 24 * 60 * 60 * 1000);
}

module.exports = { scanAndSendDailyCare, startDailyCareScheduler };
