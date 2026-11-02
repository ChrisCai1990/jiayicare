const HealthRecord = require('../models/HealthRecord');
const FollowUp = require('../models/FollowUp');
const MedicalReport = require('../models/MedicalReport');
const ServiceRecord = require('../models/ServiceRecord');

const day = value => value ? new Date(value).toISOString().slice(0, 10) : '';
const text = value => String(value || '').replace(/\s+/g, ' ').trim();

// This worksheet stays inside Jiayicare. It never calls an external AI provider.
async function buildMonthlyPhaseReviewDraft(user, window) {
  const start = new Date(window.start), end = new Date(window.end);
  const startDay = new Date(start.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const endDay = new Date(end.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const [records, followups, visits, reports] = await Promise.all([
    HealthRecord.find({ user: user._id, recordedAt: { $gte: start, $lte: end } }).sort({ recordedAt: 1 }).limit(500).select('type label value unit recordedAt').lean(),
    FollowUp.find({ patientId: user._id, date: { $gte: start, $lte: end } }).sort({ date: 1 }).limit(200).select('date theme status executedContent').lean(),
    ServiceRecord.find({ patientId: user._id, type: 'medical_visit', date: { $gte: start, $lte: end }, aiStatus: { $ne: 'pending' } }).sort({ date: 1 }).limit(100).select('date title medicalEscort.hospital medicalEscort.department supplements.kind supplements.visit.appointmentAt').lean(),
    MedicalReport.find({ user: user._id, audit_status: 'audited', checkDate: { $gte: startDay, $lte: endDay } }).sort({ checkDate: 1 }).limit(100).select('checkDate title reportItems.name reportItems.value reportItems.unit reportItems.status').lean(),
  ]);
  const types = new Map();
  records.forEach(row => { const label = text(row.label || row.type || '其他记录'); types.set(label, (types.get(label) || 0) + 1); });
  const visitDays = new Set(visits.map(row => day(row.date)));
  const reportLines = reports.slice(0, 8).map(row => {
    const names = [...new Set((row.reportItems || []).map(item => [text(item.name), text(item.value), text(item.unit)].filter(Boolean).join(' ')).filter(Boolean))];
    return `${text(row.checkDate)} ${text(row.title)}：已审核${(row.reportItems || []).length}项；项目包括${names.slice(0, 12).join('、') || '原报告未列结构化项目'}${names.length > 12 ? '等，完整结果请查看原报告' : ''}`;
  });
  const visitLines = visits.slice(0, 8).map(row => `${day(row.date)} ${text(row.title || '就医记录')}：${[row.medicalEscort?.hospital, row.medicalEscort?.department].map(text).filter(Boolean).join('／') || '机构科室待核对'}`);
  const lines = [
    ['一、本月记录与变化',
      `健康记录：${records.length}条，覆盖${new Set(records.map(row => day(row.recordedAt))).size}个日期；${[...types].map(([type, count]) => `${type}${count}条`).join('、') || '暂无本月记录'}。仅列实际提交情况，不据此评价执行。`,
      `服务随访：${followups.length}条；请核对已完成事项、未解决问题及客户反馈。`],
    ['二、生活方式与指标关联',
      '营养师核对：结合已记录的饮食、运动、睡眠和健康指标，写明能够观察到的变化；没有同期证据时明确写“现有记录无法分析两者关联”。',
      '补充记录：仅在某个具体管理问题无法判断时，提出低负担、针对性的记录建议；否则说明暂无增加记录的必要。'],
    ['三、就医、检查与待核实问题',
      `就医服务记录：${visits.length}条，覆盖${visitDays.size}个日期；这只代表系统内记录，不等于全部实际就医。`,
      ...visitLines,
      ...(visits.length > visitLines.length ? [`还有${visits.length - visitLines.length}条就医服务记录，请到服务档案逐项查看。`] : []),
      `本月已审核检查报告：${reports.length}份；正常和异常项目均请结合原始报告核对。`,
      ...reportLines,
      ...(reports.length > reportLines.length ? [`还有${reports.length - reportLines.length}份已审核报告，请到原始资料逐份查看。`] : []),
      '健康顾问核对：逐项说明仍需解决的健康问题、每次就医目的及结果；若就医较频繁，核实是否计划内复查、不同问题就诊或同一问题反复就诊。现有记录不足时写明无法判断，不推断原因。'],
    ['四、下月跟进事项',
      '营养师填写生活方式评估与需澄清的问题；健康顾问综合确认就医、检查、服务执行及后续责任人与时间。'],
  ];
  return {
    content: lines.map(([heading, ...items]) => `${heading}\n${items.map(item => `- ${item}`).join('\n')}`).join('\n\n'),
    sources: [`本月健康记录${records.length}条`, `本月服务随访${followups.length}条`, `本月就医服务记录${visits.length}条`, `本月已审核检查报告${reports.length}份`, '原始报告与完整服务档案由健康顾问人工核对'],
  };
}

module.exports = { buildMonthlyPhaseReviewDraft };
