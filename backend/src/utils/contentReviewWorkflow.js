const CONTENT_REVIEW_SEEDS = [
  { slug: 'health-management-first-consultation', title: '第一次了解健康管理服务前，可以先准备什么？', summary: '服务沟通前的资料与边界说明。', sourceUpdatedAt: '2026-09-24', reviewChain: ['nutritionist'], sourceContent: '本文为健康管理服务说明，不替代诊断、处方或急诊处置。\n\n首次沟通前，可准备近期体检报告、既往健康资料、当前生活方式记录，以及最希望解决的一个问题。\n\n服务人员会协助梳理资料、安排沟通与后续服务；出现胸痛、呼吸困难、意识改变等紧急情况，请及时线下就医。' },
  { slug: 'lipids-first-steps', title: '体检提示血脂异常后，先准备哪些信息？', summary: '体检提示血脂异常后的资料整理与就医边界说明。', sourceUpdatedAt: '2026-09-23', reviewChain: ['nutritionist', 'familyDoctor'], nutritionReview: { status: 'approved', reviewedByName: '吴苗苗营养师', reviewedAt: new Date('2026-09-23T00:00:00.000Z') }, sourceContent: '体检报告提示血脂异常时，先不要仅凭单次结果自行判断或自行用药。\n\n建议准备：完整体检报告（含采血日期与是否空腹）、既往血脂结果、目前服用的药物或营养补充剂、近期饮食与运动情况，以及家族心血管病史等。\n\n可先记录近期外食、饮酒、含糖饮料、油炸及高脂食物的频率，作为与营养师沟通生活方式的素材。\n\n如有明显胸痛、气促、晕厥等不适，请及时线下就医。本内容仅用于健康教育和资料准备，不提供诊断、治疗或用药建议。' },
  { slug: 'checkup-report-organization', title: '体检报告整理前，先做这 4 件事', summary: '完整报告、日期、变化与专业沟通的准备说明。', sourceUpdatedAt: '2026-09-24', reviewChain: ['familyDoctor'], sourceContent: '整理体检资料时，请保留完整报告及检查日期；将历年同类指标按时间排列；标出自己最关心的变化；记录正在使用的药物与补充剂。\n\n健康管理服务可协助完成资料归类和沟通准备，不替代医生诊断。出现紧急或明显不适时，应优先线下就医。' },
  { slug: 'sustainable-weight-management-goals', title: '开始体重管理时，怎样设定更可持续的目标？', summary: '体重管理的日常行为与专业支持边界。', sourceUpdatedAt: '2026-09-24', reviewChain: ['nutritionist'], sourceContent: '体重管理可先从可持续的生活习惯开始：规律用餐、增加日常活动、观察睡眠和压力，不追求短期极端变化。\n\n可每周记录一次体重及饮食感受，结合自身情况与营养师沟通。本文不替代个体化医学诊疗；如有妊娠、慢病或进食障碍等情况，请先咨询专业人士。' },
  { slug: 'healthy-eating-rhythm', title: '饮食总是难坚持？先观察自己的用餐节奏', summary: '饮食节奏的健康教育与专业支持边界。', sourceUpdatedAt: '2026-09-24', reviewChain: ['nutritionist'], sourceContent: '先观察一周的用餐时间、饥饿感、外卖频率和加餐情形，而不是急于制定严格限制。\n\n尝试让三餐更规律，按个人生活节奏逐步调整；如需个体化饮食建议，可预约营养师沟通。本文仅作健康教育，不替代诊断和治疗。' },
];

function initialState(seed) {
  const nutritionApproved = seed.nutritionReview?.status === 'approved';
  const next = nutritionApproved && seed.reviewChain.includes('familyDoctor') ? 'familyDoctor' : (seed.reviewChain[0] || '');
  return {
    ...seed,
    currentRole: next,
    status: next ? 'pending' : 'approved',
    nutritionReview: seed.nutritionReview || { status: 'pending' },
    doctorReview: { status: 'pending' },
  };
}

async function ensureContentReviews(ContentReview) {
  const operations = CONTENT_REVIEW_SEEDS.map(seed => ({
    updateOne: { filter: { slug: seed.slug }, update: { $setOnInsert: initialState(seed) }, upsert: true },
  }));
  if (operations.length) await ContentReview.bulkWrite(operations, { ordered: false });
  // 已完成的旧记录补入新增的“健康规划师发布确认”环节；历史公开稿的 approved_ready 不受影响。
  await ContentReview.updateMany(
    { status: 'approved', currentRole: '' },
    { $set: { status: 'ready_to_publish', currentRole: 'healthPlanner' } },
  );
  // 兼容早期血脂稿使用的 advisor_pending 状态，转入当前健康顾问待审核队列。
  await ContentReview.updateMany(
    { status: 'advisor_pending', $or: [{ currentRole: { $exists: false } }, { currentRole: null }, { currentRole: '' }] },
    { $set: { status: 'pending', currentRole: 'familyDoctor' } },
  );
}

function reviewField(role) { return role === 'nutritionist' ? 'nutritionReview' : 'doctorReview'; }

function advanceReview(record, role, action, note, staff) {
  if (!['nutritionist', 'familyDoctor'].includes(role) || record.currentRole !== role) throw new Error('当前账号无此审核权限');
  if (!['approve', 'return'].includes(action)) throw new Error('审核操作无效');
  if (action === 'return' && !String(note || '').trim()) throw new Error('退回时请说明修改意见');
  const now = new Date();
  const field = reviewField(role);
  record[field] = { status: action === 'approve' ? 'approved' : 'returned', note: String(note || '').trim(), reviewedBy: staff._id, reviewedByName: staff.name || '', reviewedAt: now };
  record.auditLog.push({ action, role, note: String(note || '').trim(), by: staff._id, byName: staff.name || '', at: now });
  if (action === 'return') {
    record.status = 'changes_requested';
    return record;
  }
  const currentIndex = record.reviewChain.indexOf(role);
  const nextRole = record.reviewChain.slice(currentIndex + 1).find(Boolean) || '';
  record.currentRole = nextRole || 'healthPlanner';
  record.status = nextRole ? 'pending' : 'ready_to_publish';
  return record;
}

module.exports = { CONTENT_REVIEW_SEEDS, ensureContentReviews, advanceReview };
