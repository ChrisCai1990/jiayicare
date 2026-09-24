const CONTENT_REVIEW_SEEDS = [
  { slug: 'health-management-first-consultation', title: '第一次了解健康管理服务前，可以先准备什么？', summary: '服务沟通前的资料与边界说明。', sourceUpdatedAt: '2026-09-24', reviewChain: ['nutritionist'], sourceContent: '本文为健康管理服务说明，不替代诊断、处方或急诊处置。\n\n首次沟通前，可准备近期体检报告、既往健康资料、当前生活方式记录，以及最希望解决的一个问题。\n\n服务人员会协助梳理资料、安排沟通与后续服务；出现胸痛、呼吸困难、意识改变等紧急情况，请及时线下就医。' },
  { slug: 'lipids-first-steps', title: '体检提示血脂异常后，先准备哪些信息？', summary: '体检提示血脂异常后的资料整理与就医边界说明。', sourceUpdatedAt: '2026-09-23', reviewChain: ['nutritionist', 'familyDoctor'], nutritionReview: { status: 'approved', reviewedByName: '吴苗苗营养师', reviewedAt: new Date('2026-09-23T00:00:00.000Z') }, sourceContent: '体检报告提示血脂异常时，先不要仅凭单次结果自行判断或自行用药。\n\n建议准备：完整体检报告（含采血日期与是否空腹）、既往血脂结果、目前服用的药物或营养补充剂、近期饮食与运动情况，以及家族心血管病史等。\n\n可先记录近期外食、饮酒、含糖饮料、油炸及高脂食物的频率，作为与营养师沟通生活方式的素材。\n\n如有明显胸痛、气促、晕厥等不适，请及时线下就医。本内容仅用于健康教育和资料准备，不提供诊断、治疗或用药建议。' },
  { slug: 'checkup-report-organization', title: '体检报告整理前，先做这 4 件事', summary: '完整报告、日期、变化与专业沟通的准备说明。', sourceUpdatedAt: '2026-09-24', reviewChain: ['familyDoctor'], sourceContent: '整理体检资料时，请保留完整报告及检查日期；将历年同类指标按时间排列；标出自己最关心的变化；记录正在使用的药物与补充剂。\n\n健康管理服务可协助完成资料归类和沟通准备，不替代医生诊断。出现紧急或明显不适时，应优先线下就医。' },
  { slug: 'sustainable-weight-management-goals', title: '开始体重管理时，怎样设定更可持续的目标？', summary: '体重管理的日常行为与专业支持边界。', sourceUpdatedAt: '2026-09-24', reviewChain: ['nutritionist'], sourceContent: '体重管理可先从可持续的生活习惯开始：规律用餐、增加日常活动、观察睡眠和压力，不追求短期极端变化。\n\n可每周记录一次体重及饮食感受，结合自身情况与营养师沟通。本文不替代个体化医学诊疗；如有妊娠、慢病或进食障碍等情况，请先咨询专业人士。' },
  { slug: 'healthy-eating-rhythm', title: '饮食总是难坚持？先观察自己的用餐节奏', summary: '饮食节奏的健康教育与专业支持边界。', sourceUpdatedAt: '2026-09-24', reviewChain: ['nutritionist'], sourceContent: '先观察一周的用餐时间、饥饿感、外卖频率和加餐情形，而不是急于制定严格限制。\n\n尝试让三餐更规律，按个人生活节奏逐步调整；如需个体化饮食建议，可预约营养师沟通。本文仅作健康教育，不替代诊断和治疗。' },
  { slug: 'checkup-consultation-questions', title: '拿到体检报告后，怎样整理问题再去沟通？', summary: '保留完整报告、按时间梳理变化，并带着具体问题获得专业沟通支持。', sourceUpdatedAt: '2026-09-24', reviewChain: ['familyDoctor'], sourceContent: '沟通前可保留完整报告、检查日期和既往同类结果；将自己最关注的变化用简单语言标记出来。\n\n可以询问本次结果需要结合哪些背景理解、是否需要进一步线下咨询；避免仅依据单一数值自行得出诊断或改变用药。\n\n健康管理服务可以协助整理资料和安排沟通，不替代医生诊断、治疗或紧急处置。出现胸痛、呼吸困难、晕厥等紧急或明显不适时，应优先线下就医。' },
  { slug: 'sleep-rhythm-observation', title: '睡眠总不规律？先观察一周的真实节奏', summary: '从入睡、起床和白天精神状态的真实记录开始，寻找可以逐步调整的生活安排。', sourceUpdatedAt: '2026-09-24', reviewChain: ['familyDoctor'], sourceContent: '可连续一周简单记录大致入睡和起床时间、夜间醒来情况，以及白天的精力感受。\n\n可以先尝试让起床时间更稳定、睡前留出放松时间；一次只选择一项可做到的调整。\n\n长期明显睡不好、白天严重嗜睡、鼾声伴呼吸暂停感，或情绪和日常功能明显受影响时，应向医生或相关专业人员咨询。本文仅作健康教育，不替代诊断和治疗。' },
  { slug: 'blood-pressure-recording-preparation', title: '准备记录血压前，先把这些信息留好', summary: '记录测量时间、环境和感受，为下一步与专业人员沟通做好准备。', sourceUpdatedAt: '2026-09-24', reviewChain: ['familyDoctor'], sourceContent: '如已在专业人员建议下进行血压记录，可同时留意测量日期与时间、当时是否刚活动以及是否有不适。\n\n一次读数不能代替专业判断；不要因单次测量自行增减、停用或更换药物。\n\n出现胸痛、呼吸困难、意识异常、肢体无力或其他突发明显不适时，应及时寻求线下急救或医疗帮助。本文仅用于资料准备和健康教育，不提供诊断或治疗建议。' },
  { slug: 'everyday-activity-start', title: '想增加日常活动量，可以从哪一步开始？', summary: '不必一开始就定高目标；从现有生活节奏中寻找一项容易坚持的活动安排。', sourceUpdatedAt: '2026-09-24', reviewChain: ['familyDoctor'], sourceContent: '可以简单观察一周中走路、久坐、通勤、家务和休闲活动的大致情况，找到真实可调整的空隙。\n\n可从短距离步行、减少连续久坐或安排一项喜欢且能持续的活动开始，逐步增加。\n\n如有疾病、术后恢复、孕产期、明显疼痛、头晕或其他不适，应先向医生或相关专业人员咨询适合的活动安排。本文仅作健康教育，不替代个体化医学建议。' },
  { slug: 'annual-checkup-preparation', title: '年度体检前，提前准备哪些信息更有帮助？', summary: '把既往报告、用药与希望了解的问题提前整理好，让沟通更清楚。', sourceUpdatedAt: '2026-09-24', reviewChain: ['familyDoctor'], sourceContent: '体检前可先整理既往完整报告、近期身体感受、长期使用的药物或补充剂，以及家族中需要留意的健康情况。\n\n不确定检查前是否需要空腹、停用某类药物或调整日常安排时，应以体检机构或医生给出的具体要求为准。\n\n本文用于资料准备和健康教育，不替代诊断、治疗或个体化检查建议。' },
  { slug: 'checkup-report-comparison', title: '对比历年体检报告时，先看哪些变化？', summary: '按同类项目、检查日期和当时背景排列资料，避免只看单次数字。', sourceUpdatedAt: '2026-09-24', reviewChain: ['familyDoctor'], sourceContent: '可把历年同类检查报告按日期放在一起，并标记当时是否空腹、是否生病、是否有生活方式或用药变化。\n\n发现不同结果时，不必仅凭单项数值自行下结论；可将具体疑问和完整资料带给医生或相关专业人员沟通。\n\n如有突发或明显不适，应优先线下就医。本文仅作健康教育，不提供诊断或治疗建议。' },
  { slug: 'medication-list-preparation', title: '看健康资料前，怎样整理正在使用的药物？', summary: '保留药品名称、使用方式和开始时间，帮助专业沟通更完整。', sourceUpdatedAt: '2026-09-24', reviewChain: ['familyDoctor'], sourceContent: '可记录正在使用的药物、营养补充剂或外用产品的名称、开始时间和日常使用方式，并保留包装或处方信息。\n\n不要因阅读健康内容或单次检查结果自行停用、增减或替换药物；相关调整应与医生或药师确认。\n\n本文仅用于资料整理和沟通准备，不替代医疗建议。' },
  { slug: 'meal-recording-basics', title: '想了解自己的饮食习惯，可以怎样开始记录？', summary: '从时间、场景与感受入手，而不是急着计算或限制。', sourceUpdatedAt: '2026-09-24', reviewChain: ['nutritionist'], sourceContent: '可用几天记录大致用餐时间、食物类型、是否外食，以及当时的饥饿感和用餐场景。记录的目的在于理解习惯，而不是评判好坏。\n\n不必一次记录得非常精细；先选择自己容易坚持的方式，之后再与营养师沟通是否需要进一步调整。\n\n有疾病、孕产期、未成年人或进食困扰时，应优先向医生或相关专业人员咨询。' },
  { slug: 'balanced-meal-flexibility', title: '忙碌时，怎样让一餐更容易兼顾多样性？', summary: '从可获得的食物组合出发，为忙碌日常留出弹性。', sourceUpdatedAt: '2026-09-24', reviewChain: ['nutritionist'], sourceContent: '忙碌时不必追求每一餐都完美，可以尝试在现有选择中增加一种蔬果、蛋白质来源或主食搭配，让选择更有多样性。\n\n提前准备容易获得的食物，比临时依靠严格限制更容易长期坚持。具体安排仍应结合个人作息、文化习惯和健康情况。\n\n本文为一般健康教育，不提供个体化饮食处方或治疗建议。' },
  { slug: 'eating-out-observation', title: '外食较多时，先观察哪几个饮食习惯？', summary: '从频率、用餐节奏和饮品选择中发现更容易调整的一个环节。', sourceUpdatedAt: '2026-09-24', reviewChain: ['nutritionist'], sourceContent: '可以简单观察一周外食的次数、常见用餐时间、饮品选择，以及是否经常因忙碌而漏餐或匆忙进食。\n\n先从一个实际可行的调整开始，例如提前规划一餐、增加饮水，或为用餐留出更稳定的时间。无需用一次选择定义整体饮食表现。\n\n如有需要特殊饮食管理的疾病或其他健康情况，请咨询营养师或医生。' },
  { slug: 'weight-trend-notes', title: '关注体重变化时，哪些记录比单次数字更有用？', summary: '结合测量时间、生活节奏和身体感受，理解变化而非只追求数字。', sourceUpdatedAt: '2026-09-24', reviewChain: ['nutritionist'], sourceContent: '如选择记录体重，可尽量保持相近的测量条件，并同步记录近期睡眠、饮食节奏、活动量和身体感受。\n\n短期波动并不自动说明原因，不建议据此采取极端节食、过量运动或自行使用产品。\n\n如体重变化明显、伴随不适，或存在孕产期、慢病、进食障碍等情况，应先咨询医生或相关专业人员。本文仅作健康教育。' },
  { slug: 'hydration-routine-observation', title: '想调整喝水习惯，先从观察日常开始', summary: '记录日常饮水场景与习惯，找到适合自己的提醒方式。', sourceUpdatedAt: '2026-09-24', reviewChain: ['nutritionist'], sourceContent: '可以观察几天自己在哪些场景容易忘记喝水，例如通勤、会议、运动或外食时。\n\n无需追求统一的固定数字；可结合天气、活动量、饮食和个人感受，尝试在容易忽略的时段设置一个温和提醒。\n\n如有心、肾等疾病或医生已给出饮水限制，应以医疗团队的具体建议为准。本文仅作一般健康教育。' },
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
  // 早期审核记录只有标题/状态，没有正文快照；补齐后才能在审核页逐段阅读。
  for (const seed of CONTENT_REVIEW_SEEDS) {
    await ContentReview.updateMany(
      {
        $and: [
          { $or: [{ slug: seed.slug }, { title: seed.title }] },
          { $or: [{ sourceContent: { $exists: false } }, { sourceContent: null }, { sourceContent: '' }] },
        ],
      },
      { $set: { slug: seed.slug, summary: seed.summary, sourceContent: seed.sourceContent, sourceUpdatedAt: seed.sourceUpdatedAt, reviewChain: seed.reviewChain } },
    );
    // 审核链由受控稿件模板决定。旧记录可能已有正文却缺少（或保留了错误的）链路，
    // 不能因此把涉及血脂、就医边界等内容错误显示成“无需健康顾问审核”。
    await ContentReview.updateMany(
      { $or: [{ slug: seed.slug }, { title: seed.title }] },
      { $set: { reviewChain: seed.reviewChain } },
    );
  }
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
