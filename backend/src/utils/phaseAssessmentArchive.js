const PhaseAssessment = require('../models/PhaseAssessment');
const ServiceRecord = require('../models/ServiceRecord');
const { templateAssessmentFromContent } = require('./phaseAssessment');
const { reviewedWriteback } = require('./reviewedWriteback');

// 审核快照先持久化为 archive_pending；重试只写档，不重新审核、不调用 AI。
async function completePhaseAssessmentArchive(item, user, actor, models = {}) {
  const Assessments = models.PhaseAssessment || PhaseAssessment;
  const Records = models.ServiceRecord || ServiceRecord;
  if (item.status !== 'archive_pending' || !item.finalizedBy || !item.finalizedAt) throw new Error('缺少已确认的评估快照，不能归档');
  try {
    const version = templateAssessmentFromContent(item.content, item);
    const reviewer = { _id: item.finalizedBy, name: item.finalizedByName, role: item.finalizedByRole };
    const recordFilter = { sourcePhaseAssessmentId: item._id };
    let record;
    try {
      record = await Records.findOneAndUpdate(recordFilter, { $setOnInsert: {
        ...recordFilter, staffId: item.finalizedBy, patientId: user._id, type: 'stage_assessment', date: item.finalizedAt,
        title: `${item.periodLabel}${item.templateSnapshot?.name || '阶段性健康评估'}`,
        content: version.sections.flatMap(section => [section.title, ...section.items.map(value => `• ${value}`)]).join('\n'),
        result: item.reviewNote || '', structuredContent: version, aiStatus: 'approved', aiGeneratedAt: item.createdAt,
        writeback: reviewedWriteback({ staff: reviewer, sourceType: 'ai_draft', at: item.finalizedAt }),
      } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      record = await Records.findOne(recordFilter); // 并发 upsert 已由另一个请求成功写入。
    }
    if (!record) throw new Error('未能读取评估归档记录');
    const saved = await Assessments.findOneAndUpdate({ _id: item._id, status: 'archive_pending' }, {
      $set: { status: 'finalized', serviceRecordId: record._id, archiveError: '' }, $inc: { __v: 1 },
      $push: { auditLog: { action: 'archive', fromStatus: 'archive_pending', toStatus: 'finalized', staffId: actor._id, staffName: actor.name || '', staffRole: actor.role, at: new Date() } },
    }, { new: true });
    return { data: saved || await Assessments.findOne({ _id: item._id }), serviceRecordId: record._id };
  } catch (error) {
    // 不返回数据库内部错误；保留待办，即使重试报错也不能把已完成记录降级。
    const saved = await Assessments.findOneAndUpdate({ _id: item._id, status: 'archive_pending' }, {
      $set: { archiveError: '归档暂未完成，已保留审核结果，可安全重试' }, $inc: { __v: 1 },
    }, { new: true });
    const data = saved || await Assessments.findOne({ _id: item._id });
    return { data, serviceRecordId: data?.serviceRecordId || null };
  }
}

module.exports = { completePhaseAssessmentArchive };
