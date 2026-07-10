const FollowUp = require('../models/FollowUp');

// 频率文案 → 周期天数，用于按方案配置的频率批量排期随访占位
const FREQUENCY_DAYS = {
  '每天': 1, '每日一次': 1, '每周一次': 7, '每两周一次': 14,
  '每月一次': 30, '每季度一次': 90, '每半年一次': 182, '每年一次': 365,
};

// 多条记录模块（就医/会诊/复查/接种/检测）：每条记录本身就有明确日期，直接各生成一条随访。
// key = moduleData 里的模块 key；dateField = 该条记录里存日期的字段名；theme = 随访主题前缀。
const DATED_RECORD_MODULES = [
  { key: 'medical_treatment', dateField: 'visit_time', theme: '医疗问题解决·就医随访' },
  { key: 'specialist_collab', dateField: 'plan_time',   theme: '全专联合会诊随访' },
  { key: 'abnormal_followup', dateField: 'time',        theme: '异常复查提醒' },
  { key: 'vaccine',           dateField: 'time',        theme: '疫苗接种提醒' },
  { key: 'functional_medicine', dateField: 'time',      theme: '功能医学检测提醒' },
];

// 年度管理方案保存/更新时，按 moduleData 内容生成一批待审核的随访占位。这是"生成同时联动随访"的核心函数：
// ①有具体日期的模块（DATED_RECORD_MODULES）每条记录直接生成一条随访，日期取该记录自己的日期字段
// ②日常监测(monitoring)按 frequency 文案批量排期到未来一年内
// ③季度评估(quarterly_eval)固定每3个月生成一条，排到未来一年内
// ④年度体检(annual_checkup)按 date 字段生成一条
// ⑤生活方式评估(lifestyle)的评估周期是自由文本（如"2026年上半年"），无法解析成具体日期，不自动生成，需医护手动建随访
function buildAnnualPlanFollowUps(plan) {
  const moduleData = plan.moduleData || {};
  const created = [];
  // content：客户端详情弹窗展示的"随访内容"，此前自动生成的随访只有 theme 标题、content 为空，
  // 用户打开详情只看到一句通用兜底文案（"健管师会在随访时详细沟通"），看不到具体要做什么——
  // 现在按模块字段拼出有信息量的说明，让客户提前知道这次随访/提醒具体关于什么。
  const push = (date, theme, content) => {
    if (!date) return;
    const d = new Date(date);
    if (isNaN(d.getTime())) return;
    created.push({
      patientId: plan.patientId,
      staffId: plan.createdBy,
      date: d,
      theme,
      content: content || '',
      status: 'planned',
      sourceAnnualPlanId: plan._id,
      sourceType: 'scheduled',
      aiStatus: 'pending',
      reviewRole: 'familyDoctor',
    });
  };

  // ① 有具体日期的多条记录模块：每条各生成一条，content拼该条记录的关键字段
  for (const mod of DATED_RECORD_MODULES) {
    const records = moduleData[mod.key]?.records;
    if (!Array.isArray(records)) continue;
    records.forEach((rec, i) => {
      const label = rec.hospital || rec.name || rec.items || `第${i + 1}条`;
      const lines = [
        rec.hospital && `就医/会诊医院：${rec.hospital}`,
        rec.department && `科室：${rec.department}`,
        rec.expert && `专家：${rec.expert}`,
        rec.reason && `原因：${rec.reason}`,
        rec.purpose && `目的：${rec.purpose}`,
        rec.items && `项目：${rec.items}`,
        rec.institution && `机构：${rec.institution}`,
        rec.brand && `品牌：${rec.brand}`,
      ].filter(Boolean);
      push(rec[mod.dateField], `${mod.theme} · ${label}`, lines.join('\n'));
    });
  }

  // ② 日常监测：按配置频率批量排期到未来一年
  const monitoring = moduleData.monitoring;
  if (monitoring && monitoring.enabled !== false) {
    const days = FREQUENCY_DAYS[monitoring.frequency];
    if (days) {
      const yearEnd = new Date(Date.now() + 365 * 86400000);
      let cursor = new Date(Date.now() + days * 86400000);
      const monitorLines = [
        monitoring.items && `监测项目：${monitoring.items}`,
        monitoring.purpose && `监测目的：${monitoring.purpose}`,
        `监测频率：${monitoring.frequency}`,
      ].filter(Boolean).join('\n');
      while (cursor <= yearEnd) {
        push(cursor, `日常监测随访 · ${monitoring.items || ''}`, monitorLines);
        cursor = new Date(cursor.getTime() + days * 86400000);
      }
    }
  }

  // ③ 季度评估：固定每3个月一条，排到未来一年
  const quarterlyEval = moduleData.quarterly_eval;
  if (quarterlyEval && quarterlyEval.enabled !== false) {
    const yearEnd = new Date(Date.now() + 365 * 86400000);
    let cursor = new Date(Date.now() + 90 * 86400000);
    const evalItems = [
      quarterlyEval.body_composition && '人体成分测量',
      quarterlyEval.diet_analysis && '膳食调研及分析',
    ].filter(Boolean);
    const evalContent = evalItems.length ? `本次评估内容：${evalItems.join('、')}` : '';
    while (cursor <= yearEnd) {
      push(cursor, '季度评估随访', evalContent);
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
    push(annualCheckup.date, `年度体检提醒 · ${annualCheckup.institution || ''}`, checkupLines);
  }

  return created;
}

// 保存/更新年度管理方案时同步生成随访占位。幂等策略：只清理此前系统自动生成、
// 医护还从未审核/编辑过的记录（aiStatus:'pending'）——一旦医护审核通过（approve，含审核时顺带
// 修改日期/主题/内容）或驳回，aiStatus 变为 'approved' / null，就永久脱离自动清理范围，
// 避免"跟客户沟通后已手动调整"的随访被下一次保存方案时静默覆盖丢失。
async function syncAnnualPlanFollowUps(plan) {
  await FollowUp.deleteMany({ sourceAnnualPlanId: plan._id, sourceType: 'scheduled', aiStatus: 'pending' });
  const toCreate = buildAnnualPlanFollowUps(plan);
  if (toCreate.length) await FollowUp.insertMany(toCreate);
  return toCreate.length;
}

module.exports = { buildAnnualPlanFollowUps, syncAnnualPlanFollowUps };
