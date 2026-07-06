// ── 首次登录问卷分批推送 ────────────────────────────────────────────
// 第一批（onboarding 完成后立即推送）：健康问卷表（成人）
// 第二批（间隔数天后自动推送）：膳食调查问卷 + 心理健康量表（Epworth/SCL90/SDS/SAS）
// 分批是为了避免新用户一次性面对过多题目导致弃填率过高（已与用户确认）

const BATCH2_DELAY_DAYS = 3; // 第二批推送延迟天数

const BATCH1_TITLES = ['健康问卷表（成人）'];
const BATCH2_TITLES = ['膳食调查问卷', 'Epworth 嗜睡量表', '症状自评量表（SCL90）', '抑郁自评量表（SDS）', '焦虑自评量表（SAS）'];

// 给单个用户推送一批问卷（按标题匹配，找不到的标题静默跳过，不影响其余问卷推送）
async function pushQuestionnairesToUser(userId, titles) {
  const { DynamicQuestionnaire } = require('../models/DynamicQuestionnaire');
  const PushRecord = require('../models/PushRecord');
  const Admin = require('../models/Admin');

  // PushRecord.staffId 为必填，系统自动推送以 superadmin 账号作为操作者标识
  const superadmin = await Admin.findOne({ username: 'superadmin' }).select('_id');
  if (!superadmin) { console.error('[onboarding-push] 未找到 superadmin 账号，跳过自动推送'); return; }

  const questionnaires = await DynamicQuestionnaire.find({ title: { $in: titles }, status: 'active', deletedAt: null });
  for (const q of questionnaires) {
    // 避免重复推送同一份问卷给同一用户
    const already = await PushRecord.findOne({ patientId: userId, type: 'questionnaire', questionnaireId: q._id });
    if (already) continue;

    await PushRecord.create({
      staffId: superadmin._id, patientId: userId,
      type: 'questionnaire', questionnaireId: q._id,
      title: q.title, content: '系统自动推送（首次登录建档）',
    });
    const alreadyTargeted = (q.targetUsers || []).some(uid => String(uid) === String(userId));
    if (!alreadyTargeted) {
      await DynamicQuestionnaire.findByIdAndUpdate(q._id, {
        $addToSet: { targetUsers: userId },
        $set: { targetType: 'specific' },
      });
    }
  }
}

async function pushBatch1(userId) {
  await pushQuestionnairesToUser(userId, BATCH1_TITLES);
}

// 扫描所有"完成onboarding满BATCH2_DELAY_DAYS天、且未推送过第二批"的用户，逐一推送
async function scanAndPushBatch2() {
  const User = require('../models/User');
  const cutoff = new Date(Date.now() - BATCH2_DELAY_DAYS * 24 * 60 * 60 * 1000);
  const users = await User.find({
    onboardingCompleted: true,
    onboardingCompletedAt: { $ne: null, $lte: cutoff },
    onboardingBatch2PushedAt: null,
  }).select('_id');

  for (const u of users) {
    try {
      await pushQuestionnairesToUser(u._id, BATCH2_TITLES);
      await User.findByIdAndUpdate(u._id, { onboardingBatch2PushedAt: new Date() });
    } catch (e) {
      console.error('[onboarding-push] 第二批问卷推送失败 userId=' + u._id, e.message);
    }
  }
  if (users.length > 0) console.log(`[onboarding-push] 第二批问卷已推送给 ${users.length} 位用户`);
}

// 启动定时扫描（每天一次），供 index.js 在服务启动时调用
function startBatch2Scheduler() {
  scanAndPushBatch2().catch(e => console.error('[onboarding-push] 首次扫描失败', e.message));
  setInterval(() => {
    scanAndPushBatch2().catch(e => console.error('[onboarding-push] 定时扫描失败', e.message));
  }, 24 * 60 * 60 * 1000);
}

module.exports = { pushBatch1, scanAndPushBatch2, startBatch2Scheduler };
