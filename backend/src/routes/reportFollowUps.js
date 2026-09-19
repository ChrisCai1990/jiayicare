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
    return row;
  }
  router.get('/patients/:patientId', staffAuth, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.patientId)) fail('客户ID无效', 400);
    await visible(req, req.params.patientId);
    const rows = await Draft.find({ patientId: req.params.patientId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data: rows });
  }));
  router.post('/:id/generate', staffAuth, wrap(async (req, res) => {
    const row = await load(req);
    if (row.status !== 'advisor_review') fail('当前草稿不可重新生成');
    if (row.followUpAutomation?.status === 'skipped' && req.body.confirmIncrement !== true) fail('请先核对旧随访，确认仅补充新增事项');
    await workflow.assertReportDraftSource(row);
    const updated = await workflow.generateReportDraft(row._id, { revision: req.body.revision });
    res.json({ success: true, data: updated });
  }));
  router.post('/:id/review', staffAuth, wrap(async (req, res) => {
    let row = await load(req);
    const action = req.body.action;
    if (!['approve', 'reject', 'take_over'].includes(action)) fail('审核动作无效', 400);
    if (row.status !== 'approved' || action !== 'approve') {
      if (!(row.status === 'advisor_review' || (action === 'take_over' && row.status === 'no_action')) || req.body.revision !== row.__v) fail('草稿状态已更新，请刷新');
      if (action !== 'reject') await workflow.assertReportDraftSource(row);
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
