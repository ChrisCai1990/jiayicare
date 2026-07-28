// 专项筛查年度小结：按 ProjectCategory 大类（肿瘤/心脑血管病/慢性病及其他）聚合该客户当年度
// 所有已审核报告里归属该类目的检查项，生成"已检查N项/异常M项/缺失清单"的确定性统计小结。
// 分类口径对齐 AiHealthScreen.js 已有的三个板块（tumor_risk/cardiovascular_risk/chronic_disease），
// 供用户查看AI健康分析时左右对照核查，不需要跳出页面翻找原始报告（2026-07-28新增）。
const MedicalReport = require('../models/MedicalReport');
const ProjectCategory = require('../models/ProjectCategory');

// 与 backend/src/routes/staff.js REPORT_TYPE_TO_L1_NAME 保持一致的 L1 大类命名口径
const YEARLY_SUMMARY_CATEGORIES = [
  { key: 'tumor_risk', label: '肿瘤筛查', l1Name: '肿瘤筛查' },
  { key: 'cardiovascular_risk', label: '心脑血管病筛查', l1Name: '心脑血管病筛查' },
  { key: 'chronic_disease', label: '慢性病及其他', l1Name: '慢性病筛查' },
];

async function buildScreeningYearlySummary(userId, year) {
  const l1Nodes = await ProjectCategory.find({
    parent: null, status: 'active',
    name: { $in: YEARLY_SUMMARY_CATEGORIES.map(c => c.l1Name) },
  }).select('_id name').lean();
  const nameToId = new Map(l1Nodes.map(n => [n.name, String(n._id)]));

  const reports = await MedicalReport.find({
    user: userId, audit_status: 'audited', reportYear: Number(year),
  }).select('reportItems checkDate date title').lean();

  return YEARLY_SUMMARY_CATEGORIES.map(cat => {
    const l1Id = nameToId.get(cat.l1Name);
    if (!l1Id) return { ...cat, checkedCount: 0, abnormalCount: 0, abnormalItems: [], available: false };

    const items = [];
    reports.forEach(r => {
      (r.reportItems || []).forEach(item => {
        if (item.screeningCategory === l1Id) items.push(item);
      });
    });
    const abnormalItems = items.filter(it => it.status === 'abnormal').map(it => it.name).filter(Boolean);
    return {
      ...cat,
      checkedCount: items.length,
      abnormalCount: abnormalItems.length,
      abnormalItems,
      available: true,
    };
  });
}

module.exports = { buildScreeningYearlySummary, YEARLY_SUMMARY_CATEGORIES };
