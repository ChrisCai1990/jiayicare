const FollowUp = require('../models/FollowUp');
const { sourceDate, assertAmendedRowUnchanged } = require('./annualScheduleAmendments');

// 占位记录预生成窗口：只提前生成未来 N 天内的，而不是一次性铺满全年。
// 此前"每天"频率的监测项会一次性生成365条占位，单个客户能堆到几百条，
// 把真实/已完成的随访记录挤到分页后面（2026-07-13 反馈：客户详情页随访记录
// 被2027年的占位数据淹没，"已随访"计数看起来是0）。改为滚动窗口后，
// 每日定时任务（syncScheduledFollowUpsWindow）负责每天补生成窗口最后一天的占位。
// 30天对齐用户端 TasksScreen 的"本月"筛选口径（Date.now()+30天），
// 保证用户端切到"本月"看到的随访计划是完整的，同时不会像365天那样疯狂堆积。
const HORIZON_DAYS = 30;

// 同一客户、同一天、同一随访内容就是同一个排期。不能依赖方案版本或数组下标：
// 年度方案重建/调整后会产生新的 planId 和 key，但不应把同一件事再次送审。
// 去掉排版标点差异，避免同一内容只因空格/标点变化而重复出现。
const normalizeScheduleText = (value) => String(value || '')
  .replace(/\s+/g, '')
  .replace(/[，,。；;：:（）()\[\]【】]/g, '');

const logicalScheduleKey = (row) => {
  const day = row.date ? new Date(row.date).toISOString().slice(0, 10) : '';
  // 审核时允许调整执行内容，原始排期会移入 plannedContent；去重必须仍按原排期识别。
  const content = normalizeScheduleText(row.plannedContent || row.content);
  const fallbackTheme = normalizeScheduleText(row.theme);
  return [row.patientId, day, content || fallbackTheme].join('|');
};

// 多条记录模块（就医/会诊/复查/接种/检测）：每条记录本身就有明确日期，直接各生成一条随访。
// key = moduleData 里的模块 key；dateField = 该条记录里存日期的字段名；theme = 随访主题前缀。
const DATED_RECORD_MODULES = [
  { key: 'medical_treatment', dateField: 'visit_time', theme: '医疗问题解决·就医随访' },
  { key: 'specialist_collab', dateField: 'plan_time',   theme: '全专联合会诊随访' },
  { key: 'checkup_completion', dateField: 'time',       theme: '体检完善提醒' },
  { key: 'abnormal_followup', dateField: 'time',        theme: '异常复查提醒' },
  { key: 'vaccine',           dateField: 'time',        theme: '疫苗接种提醒' },
  { key: 'functional_medicine', dateField: 'time',      theme: '功能医学检测提醒' },
];

// 客户确认年度管理方案后，按 moduleData 内容直接生成可执行随访计划。这是"确认即联动随访"的核心函数：
// ①有具体日期的模块（DATED_RECORD_MODULES）每条记录直接生成一条随访，日期取该记录自己的日期字段
// ②日常监测(monitoring)由 Reminder 独立承接，不进入随访计划
// ③季度评估(quarterly_eval)固定每3个月生成一条，排到未来一年内
// ④年度体检(annual_checkup)按 date 字段生成一条
// ⑤生活方式评估(lifestyle)的评估周期是自由文本（如"2026年上半年"），无法解析成具体日期，不自动生成，需医护手动建随访
async function buildAnnualPlanFollowUps(plan) {
  const moduleData = plan.moduleData || {};
  const created = [];

  // 就医提醒属于健管专员的落地执行事项。健康顾问/规划师负责制定与审核方案，
  // 不能因为方案记录里误填了 followUpStaff，就把就医提醒挂到他们的个人随访。
  const User = require('../models/User');
  const patient = await User.findById(plan.patientId).select('assignedHealthManager').lean();

  // "协调专员/评估人员"字段存的是 Admin _id（staff-select 选择器），拼进 content 前要解析成姓名，
  // 否则客户端会看到一串无意义的 ObjectId 字符串。一次性查出本方案里出现过的所有员工id。
  const Admin = require('../models/Admin');
  const staffIds = new Set();
  if (patient?.assignedHealthManager) staffIds.add(String(patient.assignedHealthManager));
  DATED_RECORD_MODULES.forEach(mod => {
    (moduleData[mod.key]?.records || []).forEach(rec => {
      if (rec.coordinator) staffIds.add(String(rec.coordinator));
      if (rec.followUpStaff) staffIds.add(String(rec.followUpStaff));
    });
  });
  (moduleData.monitoring?.records || []).forEach(rec => { if (rec.followUpStaff) staffIds.add(String(rec.followUpStaff)); });
  if (moduleData.lifestyle?.staff) staffIds.add(String(moduleData.lifestyle.staff));
  if (moduleData.quarterly_eval?.followUpStaff) staffIds.add(String(moduleData.quarterly_eval.followUpStaff));
  if (moduleData.annual_checkup?.followUpStaff) staffIds.add(String(moduleData.annual_checkup.followUpStaff));
  (moduleData.personalized_followups?.records || []).forEach(rec => {
    if (rec.followUpStaff) staffIds.add(String(rec.followUpStaff));
    if (rec.collaborator) staffIds.add(String(rec.collaborator));
  });
  const staffNameMap = {};
  if (staffIds.size) {
    const mongoose = require('mongoose');
    const validIds = [...staffIds].filter(id => mongoose.Types.ObjectId.isValid(id));
    const staffs = await Admin.find({ _id: { $in: validIds } }).select('name').lean();
    staffs.forEach(s => { staffNameMap[String(s._id)] = s.name; });
  }
  const staffName = (idOrName) => staffNameMap[String(idOrName)] || idOrName;
  // content：客户端详情弹窗展示的"随访内容"，此前自动生成的随访只有 theme 标题、content 为空，
  // 用户打开详情只看到一句通用兜底文案（"健管师会在随访时详细沟通"），看不到具体要做什么——
  // 现在按模块字段拼出有信息量的说明，让客户提前知道这次随访/提醒具体关于什么。
  // assignedTo：随访任务实际归属的执行人（方案里填的"随访人员"），决定随访出现在谁的工作台"名下"；
  // staffId 仅表示创建人，两者语义不同，混用会导致审核通过后随访挂不到指定人名下。
  const push = (date, theme, content, assignedTo, sourceScheduleKey, delivery = {}) => {
    // 只有明确了随访时间和随访人，才构成可执行的随访计划；否则不向客户或工作台投放半成品。
    if (!date || !assignedTo) return;
    const d = new Date(date);
    if (isNaN(d.getTime())) return;
    const mongoose = require('mongoose');
    created.push({
      patientId: plan.patientId,
      staffId: plan.createdBy,
      assignedTo: (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) ? assignedTo : null,
      date: d,
      theme,
      content: content || '',
      status: 'planned',
      sourceAnnualPlanId: plan._id,
      sourceScheduleKey,
      sourceType: 'scheduled',
      deliveryMode: delivery.serviceMode || 'reminder',
      deliveryType: delivery.serviceType || '',
      // 年度方案已经过健康顾问审核及客户确认，不再让健管专员重新制定、
      // 也不重复进入家庭医生审核；负责人可直接在工作台按计划执行。
      aiStatus: 'approved',
      reviewRole: null,
    });
  };

  // ① 有具体日期的多条记录模块：每条各生成一条，content拼该条记录的关键字段
  for (const mod of DATED_RECORD_MODULES) {
    const records = moduleData[mod.key]?.records;
    if (!Array.isArray(records)) continue;
    records.forEach((rec, i) => {
      const fallbackLabels = {
        medical_treatment: '就医安排', specialist_collab: '联合会诊', checkup_completion: '体检完善',
        abnormal_followup: '异常复查', vaccine: '疫苗接种', functional_medicine: '功能医学检测',
      };
      const label = rec.hospital || rec.name || rec.items || rec.standardPlanName || fallbackLabels[mod.key] || `第${i + 1}条`;
      // 年度方案随访统一由客户的健管专员承接；patientId 让同一计划同步展示给客户。
      // 其他岗位的代约、陪同、会诊等服务任务由 annualPlanServiceTasks 另行拆分。
      const executor = patient?.assignedHealthManager;
      const details = [
        rec.standardPlanName && `执行方案：${rec.standardPlanName}`,
        rec.hospital && `就医/会诊医院：${rec.hospital}`,
        rec.department && `科室：${rec.department}`,
        rec.expert && `专家：${rec.expert}`,
        rec.reason && `原因：${rec.reason}`,
        rec.basisSummary && `设置依据：${rec.basisSummary}`,
        rec.purpose && `目的：${rec.purpose}`,
        rec.items && `项目：${rec.items}`,
        rec.name && `项目：${rec.name}`,
        rec.institution && `机构：${rec.institution}`,
        rec.brand && `品牌：${rec.brand}`,
        rec.order_dept && `开单科室：${rec.order_dept}`,
        rec.order_expert && rec.order_expert !== '无' && `开单专家：${rec.order_expert}`,
        rec.standardContent && `标准执行内容：${rec.standardContent}`,
        rec.frequency && `执行频次：${rec.frequency}`,
        rec.customerAction && `客户行动：${rec.customerAction}`,
        rec.assist && '已安排就医协助',
        rec.coordinator && `协调专员：${staffName(rec.coordinator)}`,
        (rec.precautions || rec.notes) && `注意事项：${rec.precautions || rec.notes}`,
      ].filter(Boolean);
      const lines = [...details, executor && `执行人员：${staffName(executor)}`].filter(Boolean);
      push(rec[mod.dateField], `${mod.theme} · ${label}`, lines.join('\n'), executor,
        `${mod.key}:${String(sourceDate(plan, mod.key, i, mod.dateField, rec[mod.dateField])).slice(0, 10)}:${String(label).trim()}`, rec);
    });
  }

  // ② 日常监测不生成 FollowUp。血压/体重等由 annualPlanMonitoringReminders
  // 生成聚合系统提醒，避免随访列表和消息未读数被高频打卡事项淹没。

  // ③ 季度评估：固定每3个月一条，只提前生成未来 HORIZON_DAYS 天内到期的那一条（如果有）
  const quarterlyEval = moduleData.quarterly_eval;
  if (quarterlyEval && quarterlyEval.enabled !== false) {
    const horizonEnd = new Date(Date.now() + HORIZON_DAYS * 86400000);
    let cursor = new Date(Date.now() + 90 * 86400000);
    const evalItems = [
      quarterlyEval.body_composition && '人体成分测量',
      quarterlyEval.diet_analysis && '膳食调研及分析',
    ].filter(Boolean);
    const evalContent = evalItems.length ? `本次评估内容：${evalItems.join('、')}` : '';
    while (cursor <= horizonEnd) {
      push(cursor, '季度评估随访', evalContent, patient?.assignedHealthManager,
        `quarterly_eval:${cursor.toISOString().slice(0, 10)}`, quarterlyEval);
      cursor = new Date(cursor.getTime() + 90 * 86400000);
    }
  }

  // ④ 年度体检：按计划日期生成一条
  const annualCheckup = moduleData.annual_checkup;
  if (annualCheckup && annualCheckup.enabled !== false) {
    const checkupLines = [
      annualCheckup.institution && `计划体检机构：${annualCheckup.institution}`,
      annualCheckup.focus && `重点关注：${annualCheckup.focus}`,
      annualCheckup.escort && '已安排陪检服务',
    ].filter(Boolean).join('\n');
    push(annualCheckup.date, `年度体检提醒 · ${annualCheckup.institution || ''}`, checkupLines, patient?.assignedHealthManager,
      `annual_checkup:${String(sourceDate(plan, 'annual_checkup', 0, 'date', annualCheckup.date)).slice(0, 10)}`, annualCheckup);
  }

  // ⑤ 个性化随访方案：AI只能从Admin启用的标准随访方案库筛选，健康顾问
  // 补齐负责人并审核年度总方案。客户确认后按标准方案周期直接生成执行计划。
  const personalizedRecords = moduleData.personalized_followups?.records;
  if (Array.isArray(personalizedRecords)) {
    const baseDate = new Date(plan.confirmedAt || Date.now());
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const horizonEnd = new Date(Date.now() + HORIZON_DAYS * 86400000);
    personalizedRecords.forEach((rec, recordIndex) => {
      const cycles = Array.isArray(rec.sourceCycles) ? rec.sourceCycles : [];
      const dates = [];
      if (rec.executionDate && !isNaN(new Date(rec.executionDate).getTime())) dates.push(new Date(rec.executionDate));
      cycles.forEach(cycle => {
        if (!dates.length && cycle.cycleType === 'date' && cycle.cycleDate) {
          const fixed = new Date(cycle.cycleDate);
          if (fixed >= todayStart) dates.push(fixed);
        }
        if (cycle.cycleType !== 'date' && Number(cycle.cycleDuration) > 0) {
          const unitDays = cycle.cycleUnit === 'week' ? 7 : cycle.cycleUnit === 'month' ? 30 : 1;
          dates.push(new Date(baseDate.getTime() + Number(cycle.cycleDuration) * unitDays * 86400000));
        }
      });
      if (!dates.length && rec.time && !isNaN(new Date(rec.time).getTime())) dates.push(new Date(rec.time));
      const content = [
        rec.standardPlanName && `标准方案：${rec.standardPlanName}`,
        rec.standardContent && `标准执行内容：${rec.standardContent}`,
        rec.standardSchedule && `标准执行周期：${rec.standardSchedule}`,
        rec.matchReason && `选用依据：${rec.matchReason}`,
        (rec.personalization || rec.content) && `个性化调整：${rec.personalization || rec.content}`,
        rec.frequency && `执行频次：${rec.frequency}`,
        rec.precautions && `注意事项：${rec.precautions}`,
        rec.customerAction && `客户行动：${rec.customerAction}`,
      ].filter(Boolean).join('\n');
      dates.filter(date => !isNaN(date.getTime()) && date >= todayStart && date <= horizonEnd).forEach((date, cycleIndex) => {
        push(date, `标准随访 · ${rec.standardPlanName || rec.items || '年度管理'}`, content, patient?.assignedHealthManager,
          `personalized:${rec.standardPlanId || recordIndex}:${cycleIndex}:${date.toISOString().slice(0, 10)}`, rec);
      });
      if (rec.collaborator && rec.collaborationDate) {
        const collaborationDate = new Date(rec.collaborationDate);
        if (!isNaN(collaborationDate.getTime()) && collaborationDate >= todayStart && collaborationDate <= horizonEnd) {
          push(collaborationDate, `协同执行 · ${rec.items || rec.standardPlanName || '年度管理'}`, content, rec.collaborator,
            `personalized-collab:${rec.standardPlanId || recordIndex}:${collaborationDate.toISOString().slice(0, 10)}`);
        }
      }
    });
  }

  return created;
}

// 保存/定时刷新都按稳定排期键原位同步。已审核记录永不重建；待审核记录仅更新，
// 从而既保留人工修改，又避免每天刷新把同一计划再次送审。
async function syncAnnualPlanFollowUps(plan) {
  const gate = await require('./annualServicePeriod').annualExecutionGate(plan);
  if (!gate.allowed) return 0;
  if (plan.continuitySource?.previousPlanId) plan = { ...(gate.executionPlan || (plan.toObject ? plan.toObject() : plan)), confirmedAt: gate.anchor };
  // 清理旧版本生成且尚未完成的监测随访；已完成记录作为历史保留。
  await FollowUp.deleteMany({
    sourceAnnualPlanId: plan._id,
    sourceType: 'scheduled',
    sourceScheduleKey: /^monitoring:/,
    status: { $ne: 'completed' },
  });
  const toCreate = await buildAnnualPlanFollowUps(plan);
  const existing = await FollowUp.find({ sourceAnnualPlanId: plan._id, sourceType: 'scheduled' }).sort({ createdAt: 1 });
  const desiredKeys = new Set(toCreate.map(row => row.sourceScheduleKey));
  let created = 0;

  for (const row of toCreate) {
    // sourceScheduleKey 旧版含数组下标，方案编辑后会变化；始终以业务内容匹配，兼容并清理旧键。
    const matches = existing.filter(item => (
      (item.sourceScheduleKey && item.sourceScheduleKey === row.sourceScheduleKey)
      || logicalScheduleKey(item) === logicalScheduleKey(row)
    ));
    if (matches.length) {
      // 优先保留已执行，其次保留已审核记录；相同排期的待审副本直接清理。
      const keep = matches.find(item => item.status === 'completed') || matches.find(item => item.aiStatus === 'approved') || matches[0];
      assertAmendedRowUnchanged(plan, row.sourceScheduleKey, keep.date, row.date);
      if (plan.continuitySource?.previousPlanId && ['completed', 'cancelled'].includes(keep.status)) continue;
      if (keep.sourceScheduleKey !== row.sourceScheduleKey) keep.sourceScheduleKey = row.sourceScheduleKey;
      if (keep.aiStatus === 'pending') {
        ['patientId', 'staffId', 'assignedTo', 'date', 'theme', 'content', 'aiStatus', 'reviewRole', 'deliveryMode', 'deliveryType'].forEach(k => { keep[k] = row[k]; });
      }
      // 自动排期仍未执行时，用方案中的完整结构化内容修复旧版只保存了“空腹”等
      // 单个字段的展示问题；已完成历史记录保持原样。
      if (['planned', 'in_progress', 'missed'].includes(keep.status) && row.content) {
        keep.theme = row.theme;
        keep.content = row.content;
        keep.deliveryMode = row.deliveryMode;
        keep.deliveryType = row.deliveryType;
      }
      // 已确认方案生成的未完成就医提醒也要跟随当前健管专员归属修正；已完成历史不改。
      if (/^(medical_treatment|annual_checkup):/.test(row.sourceScheduleKey || '') && keep.status !== 'completed') {
        keep.assignedTo = row.assignedTo;
      }
      await keep.save();
      // 已存在的历史副本不在定时同步中批量删除；这里只阻止继续生成，具体旧数据按核实后定点清理。
    } else {
      if (plan.continuitySource?.previousPlanId) {
        const result = await require('./annualDispatchOnce').insertAnnualOnce(FollowUp, plan, 'scheduled', row.sourceScheduleKey,
          { sourceAnnualPlanId: plan._id, sourceType: 'scheduled', sourceScheduleKey: row.sourceScheduleKey }, row);
        created += result.upsertedCount || 0;
      } else { await FollowUp.create(row); created++; }
    }
  }

  // 方案中已删除的排期，仅清理尚未审核的占位；已审核历史继续保留。
  await FollowUp.deleteMany({
    sourceAnnualPlanId: plan._id, sourceType: 'scheduled', aiStatus: 'pending',
    sourceScheduleKey: { $nin: [...desiredKeys] },
  });
  return created;
}

// 清理修复上线前已生成的历史副本：仅处理同一年度方案、同一客户、同一天且内容相同的自动排期，
// 优先保留已审核/已执行记录，绝不触碰人工创建的随访。
async function dedupeAnnualPlanFollowUps() {
  const rows = await FollowUp.find({ sourceAnnualPlanId: { $ne: null }, sourceType: 'scheduled' })
    .sort({ createdAt: 1 }).lean();
  const groups = new Map();
  rows.forEach(row => {
    // 同一方案的稳定排期键优先级最高：人工修改执行内容后仍是同一项，不能因内容变化逃过去重。
    // 没有稳定键的旧记录继续用客户+日期+原始内容兼容识别。
    const key = row.sourceScheduleKey
      ? `${row.patientId}|${row.sourceAnnualPlanId}|${row.sourceScheduleKey}`
      : logicalScheduleKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  let removed = 0;
  for (const items of groups.values()) {
    if (items.length < 2) continue;
    const keep = items.find(x => x.status === 'completed') || items.find(x => x.aiStatus === 'approved') || items[0];
    const ids = items.filter(x => String(x._id) !== String(keep._id)).map(x => x._id);
    if (ids.length) { const result = await FollowUp.deleteMany({ _id: { $in: ids } }); removed += result.deletedCount || 0; }
  }
  return removed;
}

module.exports = { buildAnnualPlanFollowUps, syncAnnualPlanFollowUps, dedupeAnnualPlanFollowUps, logicalScheduleKey };
