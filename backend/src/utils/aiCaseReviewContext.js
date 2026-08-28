const MedicalReport = require('../models/MedicalReport');
const HealthRecord = require('../models/HealthRecord');
const Medication = require('../models/Medication');
const Supplement = require('../models/Supplement');
const FollowUp = require('../models/FollowUp');
const AnnualPlan = require('../models/AnnualPlan');

const clean = value => JSON.parse(JSON.stringify(value == null ? null : value));

async function buildContext(user, scopes = []) {
  const wanted = new Set(scopes);
  const snapshot = { capturedAt: new Date(), patientId: String(user._id), sources: [] };
  if (wanted.has('basic')) {
    snapshot.basic = clean({ name: user.name, age: user.age, birthDate: user.birthDate, gender: user.gender, height: user.height, weight: user.weight, chronicDiseases: user.chronicDiseases, healthConcern: user.healthConcern });
    snapshot.sources.push('客户基本资料（当前版本）');
  }
  if (wanted.has('healthProfile')) {
    snapshot.healthProfile = clean({ healthProfile: user.healthProfile, lifestyle: user.lifestyle, lifestyle_data: user.lifestyle_data, preferences: user.preferences });
    snapshot.sources.push('健康档案与生活方式（当前版本）');
  }
  if (wanted.has('reports')) {
    const reports = await MedicalReport.find({ user: user._id, audit_status: 'audited' }).sort({ checkDate: -1, createdAt: -1 }).limit(30)
      .select('title reportYear checkDate institution examConclusion reportItems aiSummary').lean();
    snapshot.reports = clean(reports);
    snapshot.sources.push(...reports.map(r => `${r.checkDate || r.reportYear || '日期未知'} · ${r.title}`));
  }
  if (wanted.has('healthRecords')) {
    snapshot.healthRecords = clean(await HealthRecord.find({ user: user._id }).sort({ date: -1, createdAt: -1 }).limit(180).lean());
    snapshot.sources.push('近期健康监测记录（最多180条）');
  }
  if (wanted.has('medications')) {
    const [medications, supplements] = await Promise.all([
      Medication.find({ user: user._id }).sort({ createdAt: -1 }).lean(),
      Supplement.find({ user: user._id }).sort({ createdAt: -1 }).lean(),
    ]);
    snapshot.medications = clean(medications);
    snapshot.supplements = clean(supplements);
    snapshot.sources.push('当前及历史用药、营养补充记录');
  }
  if (wanted.has('followups')) {
    snapshot.followups = clean(await FollowUp.find({ user: user._id }).sort({ date: -1, createdAt: -1 }).limit(50).lean());
    snapshot.sources.push('最近50条随访记录');
  }
  if (wanted.has('plans')) {
    snapshot.plans = clean(await AnnualPlan.find({ patientId: user._id }).sort({ year: -1, createdAt: -1 }).limit(5).lean());
    snapshot.sources.push('近年管理方案');
  }
  if (wanted.has('aiAnalysis')) {
    snapshot.aiAnalysis = clean({ aiHealthSummary: user.aiHealthSummary, aiRiskAssessment: user.aiRiskAssessment });
    snapshot.sources.push('已保存的AI健康信息整理与风险评估');
  }
  return snapshot;
}

async function buildStageAssessmentContext(user, days = 30) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const [records, followups, plan, reports] = await Promise.all([
    HealthRecord.find({ user: user._id, recordedAt: { $gte: start, $lte: end } }).sort({ recordedAt: 1 })
      .select('category type label value unit extra status note recordedAt recordedBy.source').limit(240).lean(),
    FollowUp.find({ patientId: user._id, date: { $gte: start, $lte: end } }).sort({ date: 1 })
      .select('date type status theme content plannedContent executedContent vitals checkInItems completedAt').limit(60).lean(),
    AnnualPlan.findOne({ patientId: user._id, confirmedAt: { $ne: null } }).sort({ confirmedAt: -1 })
      .select('year planType templateName moduleData notes confirmedAt').lean(),
    MedicalReport.find({ user: user._id, audit_status: 'audited' }).sort({ checkDate: -1, createdAt: -1 }).limit(5)
      .select('title reportYear checkDate institution examConclusion keyFindings reportItems.name reportItems.value reportItems.unit reportItems.status reportItems.conclusion').lean(),
  ]);
  const reportBaselines = reports.map(report => ({
    title: report.title, date: report.checkDate || report.reportYear, institution: report.institution,
    conclusion: report.examConclusion,
    findings: (report.reportItems || []).filter(item => ['abnormal', 'attention'].includes(item.status) || item.conclusion)
      .slice(0, 20).map(item => ({ name: item.name, value: item.value, unit: item.unit, status: item.status, conclusion: item.conclusion })),
  }));
  const daysCovered = new Set(records.map(item => new Date(item.recordedAt).toISOString().slice(0, 10)));
  const types = [...new Set(records.map(item => item.type))];
  return clean({
    capturedAt: end,
    period: { days, start, end },
    monitoringCoverage: { recordCount: records.length, distinctDays: daysCovered.size, types },
    recentHealthRecords: records,
    periodFollowups: followups,
    currentLifestyle: { lifestyle: user.lifestyle, lifestyle_data: user.lifestyle_data, preferences: user.preferences },
    confirmedAnnualPlan: plan,
    examBaseline: reportBaselines,
    historicalTrendSummary: { aiHealthSummary: user.aiHealthSummary, aiRiskAssessment: user.aiRiskAssessment },
    basic: { age: user.age, gender: user.gender, height: user.height, weight: user.weight, chronicDiseases: user.chronicDiseases },
    sources: [
      `近${days}天健康监测：${records.length}条，覆盖${daysCovered.size}天`,
      `本周期随访与执行记录：${followups.length}条`,
      '当前生活方式档案',
      plan ? '已确认年度管理方案' : '年度管理方案缺失',
      `已审核体检基线：${reportBaselines.length}份（仅作背景）`,
    ],
  });
}

module.exports = { buildContext, buildStageAssessmentContext };
