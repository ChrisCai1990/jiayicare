const express = require('express');
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const Draft = require('../models/ReportFollowUpDraft');
const { validateAssessmentFollowUpDrafts } = require('../utils/assessmentFollowUpDrafts');
const workflow = require('../utils/reportFollowUpAutomation');
const { publishReportFollowUps } = require('../utils/dynamicAssessmentFollowUps');

module.exports = ({ getVisiblePlanPatientIds }) => {
  const router = express.Router();
  const wrap = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) { res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : '报告随访处理未完成，请刷新后重试' }); }
  };
  const fail = (message, statusCode = 409) => { throw Object.assign(new Error(message), { statusCode }); };
  async function visible(req, patientId) {
    const ids = await getVisiblePlanPatientIds(req.staff);
    if (ids && !ids.some(id => String(id) === String(patientId))) fail('无权查看该客户', 403);
    if (!ids && !(await require('../models/User').exists({ _id: patientId }))) fail('客户不存在或不属于当前机构', 403);
  }
  async function load(req) {
    if (!['familyDoctor', 'superadmin'].includes(req.staff.role)) fail('仅健康顾问可处理随访草稿', 403);
    if (!mongoose.isValidObjectId(req.params.id)) fail('草稿ID无效', 400);
    const row = await Draft.findById(req.params.id);
    if (!row) fail('草稿不存在', 404);
    await visible(req, row.patientId);
    require('../utils/healthManagementRollout').assertPatientEnabled(row.patientId);
    return row;
  }
  router.get('/patients/:patientId', staffAuth, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.patientId)) fail('客户ID无效', 400);
    await visible(req, req.params.patientId);
    if (!require('../utils/healthManagementRollout').enabledForPatient(req.params.patientId)) return res.json({ success: true, data: [], enabled: false });
    const rows = await Draft.find({ patientId: req.params.patientId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data: rows.map(require('../utils/reportIssues').reviewView) });
  }));
  router.post('/:id/generate', staffAuth, wrap(async (req, res) => {
    const row = await load(req);
    if (req.body.issueMode === true) {
      if (!['advisor_review', 'no_action', 'excluded'].includes(row.status) || req.body.revision !== row.__v
        || ['running', 'queued'].includes(row.followUpAutomation?.status)) fail('草稿正在处理或状态已更新，请刷新');
      await workflow.assertReportDraftSource({ ...(row.toObject ? row.toObject() : row), purpose: 'annual_report_input' });
      const updated = await Draft.findOneAndUpdate({ _id: row._id, status: row.status, __v: row.__v }, {
        $set: { purpose: 'annual_report_input', status: 'advisor_review', followUpAutomation: { status: 'queued', message: '已排队，正在逐项核对完整已解析资料。' } }, $inc: { __v: 1 },
      }, { new: true });
      if (!updated) fail('草稿已更新，请刷新');
      workflow.wakeReportDraftWorker();
      return res.status(202).json({ success: true, data: updated });
    }
    if (row.status !== 'advisor_review') fail('当前草稿不可重新生成');
    if (row.followUpAutomation?.status === 'skipped' && req.body.confirmIncrement !== true) fail('请先核对旧随访，确认仅补充新增事项');
    await workflow.assertReportDraftSource(row);
    const updated = await workflow.generateReportDraft(row._id, { revision: req.body.revision });
    res.json({ success: true, data: updated });
  }));
  router.post('/:id/review', staffAuth, wrap(async (req, res) => {
    let row = await load(req);
    const action = req.body.action;
    if (['save_issues', 'confirm_issues', 'manual_issues', 'resolve_coverage'].includes(action)) {
      const issues = require('../utils/reportIssues');
      row = issues.reviewView(row);
      if (!['advisor_review', 'no_action', 'excluded'].includes(row.status) || req.body.revision !== row.__v
        || row.followUpAutomation?.status === 'running') fail('草稿状态已更新，请刷新');
      await workflow.assertReportDraftSource({ ...(row.toObject ? row.toObject() : row), purpose: issues.PURPOSE });
      let issueDrafts, issueCoverage = row.issueCoverage || [], issueSources = row.issueSources || [];
      if (action === 'manual_issues') {
        if (row.purpose === issues.PURPOSE && row.issueSources?.length) {
          issueDrafts = row.issueDrafts;
        } else {
          const report = await require('../models/MedicalReport').findById(row.reportId).lean();
          issueSources = issues.issueSources(report);
          const initial = issues.reconcile(issueSources, []);
          issueDrafts = initial.issues; issueCoverage = initial.coverage;
        }
      } else {
        if (row.purpose !== issues.PURPOSE || row.followUpAutomation?.status !== 'ready') fail('请先重新提取问题或转人工核对');
        if (action === 'confirm_issues' && issueCoverage.some(item => item.status === 'pending')) fail('请先核对尚未判断的资料项目，或重新运行自动提取');
        if (action === 'confirm_issues' && req.body.coverageReviewed !== true) fail('请确认已核对资料覆盖范围及全部问题');
        try { issueDrafts = issues.validateIssues(req.body.issueDrafts, row.issueDrafts || [], { confirm: action === 'confirm_issues' }); }
        catch (error) { fail(error.message, 400); }
        if (action === 'resolve_coverage') {
          try { ({ issueDrafts, issueCoverage } = issues.resolveCoverage({ ...row, issueDrafts }, req.body.coverageDecisions)); }
          catch (error) { fail(error.message, 400); }
        }
      }
      const confirmed = action === 'confirm_issues';
      row = await Draft.findOneAndUpdate({ _id: row._id, status: row.status, __v: row.__v }, {
        $set: { purpose: issues.PURPOSE, status: confirmed ? 'approved' : 'advisor_review', issueDrafts, issueCoverage, issueSources,
          followUpAutomation: { status: 'ready', message: confirmed ? '问题及建议已确认，编制年度方案时自动融合；尚未生成执行随访。' : '问题及建议已保存，请核对覆盖范围后确认。' },
          ...(confirmed ? { advisorReviewedBy: req.staff._id, advisorReviewedAt: new Date(), followUpPublication: { status: 'annual_input', message: '已作为年度方案编制依据，不在此处派发执行任务。' } } : {}) },
        $inc: { __v: 1 }, $push: { auditLog: { action, at: new Date(), by: req.staff._id, coverageReviewed: confirmed,
          ...(action === 'resolve_coverage' ? { coverageDecisions: req.body.coverageDecisions } : {}) } },
      }, { new: true });
      if (!row) fail('草稿已更新，请刷新');
      if (confirmed) await workflow.completeReportReview(row._id);
      else await workflow.syncReportReviewTask(row);
      return res.json({ success: true, data: row });
    }
    if (!['approve', 'reject', 'take_over'].includes(action)) fail('审核动作无效', 400);
    if (row.purpose === 'annual_report_input') fail('请使用问题及建议确认入口，此处不发布随访');
    const serviceReview = action === 'approve' && req.body.serviceReviewId;
    if (serviceReview) await require('../utils/checkupMergedOutcome').runtime().assertDraft(row, req.staff, serviceReview);
    if (serviceReview && row.status === 'approved' && row.followUpPublication?.status === 'published') {
      return res.json({ success: true, data: row }); // Lost acknowledgement: preserve the exact reviewed evidence.
    }
    if (row.status !== 'approved' || action !== 'approve') {
      if (!(row.status === 'advisor_review' || (action === 'take_over' && row.status === 'no_action')) || req.body.revision !== row.__v) fail('草稿状态已更新，请刷新');
      if (action !== 'reject' && !serviceReview) await workflow.assertReportDraftSource(row);
      if (action === 'take_over' && row.followUpAutomation?.status !== 'failed' && row.status !== 'no_action') fail('仅生成失败或无新增行动的记录可人工接管');
      if (action === 'approve' && ['queued', 'running', 'failed'].includes(row.followUpAutomation?.status)) fail('请先完成草稿或人工接管');
      let drafts = row.followUpDrafts;
      if (action === 'approve') {
        try { drafts = validateAssessmentFollowUpDrafts(req.body.followUpDrafts); }
        catch (error) { fail(error.message, 400); }
      }
      const update = action === 'take_over'
        ? { status: 'advisor_review', 'followUpAutomation.status': 'ready', 'followUpAutomation.message': '已转人工核对，请补充必要随访；无新增行动可保留空列表后终审。' }
        : { status: action === 'approve' ? 'approved' : 'rejected', followUpDrafts: drafts, advisorReviewedBy: req.staff._id, advisorReviewedAt: new Date() };
      row = await Draft.findOneAndUpdate({ _id: row._id, status: row.status, __v: row.__v }, {
        $set: update, $inc: { __v: 1 }, $push: { auditLog: { action, at: new Date(), by: req.staff._id } },
      }, { new: true });
      if (!row) fail('草稿已更新，请刷新');
    }
    if (action === 'approve') {
      try {
        await publishReportFollowUps(row, req.staff);
        await workflow.completeReportReview(row._id);
        row = await Draft.findByIdAndUpdate(row._id, { $set: { followUpPublication: { status: 'published', publishedAt: new Date() } } }, { new: true });
      } catch {
        await Draft.updateOne({ _id: row._id, 'followUpPublication.status': { $ne: 'published' } }, { $set: { followUpPublication: { status: 'failed', message: '随访发布未完成，请确认健管专员及规划师归属后重试；已发布任务会保留。' } } });
        row = await Draft.findById(row._id);
      }
    } else if (action === 'reject') await workflow.completeReportReview(row._id);
    else await workflow.syncReportReviewTask(row);
    res.json({ success: true, data: row });
  }));
  return router;
};
