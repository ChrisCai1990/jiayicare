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
    snapshot.plans = clean(await AnnualPlan.find({ user: user._id }).sort({ year: -1, createdAt: -1 }).limit(5).lean());
    snapshot.sources.push('近年管理方案');
  }
  if (wanted.has('aiAnalysis')) {
    snapshot.aiAnalysis = clean({ aiHealthSummary: user.aiHealthSummary, aiRiskAssessment: user.aiRiskAssessment });
    snapshot.sources.push('已保存的AI健康信息整理与风险评估');
  }
  return snapshot;
}

module.exports = { buildContext };
