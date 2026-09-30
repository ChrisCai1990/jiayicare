const express = require('express');
const mongoose = require('mongoose');
const Model = require('../models/AnnualReportProblemReview');
const service = require('../utils/annualReportProblems');
const { randomUUID } = require('node:crypto');
const fail = (message, statusCode = 409) => { throw Object.assign(new Error(message), { statusCode }); };
const present = row => row ? { ...row, history: undefined, historyCount: row.history?.length || 0, canRetry: service.timedOut(row) } : null;
const snapshot = row => ({ at: new Date(), status: row.status, topics: row.topics, sourceFingerprint: row.sourceFingerprint, reviewedBy: row.reviewedBy, reviewedAt: row.reviewedAt });

module.exports = ({ visible }) => {
  const router = express.Router({ mergeParams: true });
  const wrap = fn => async (req, res, next) => {
    try { await fn(req, res, next); }
    catch (error) { res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : '年度综合问题处理未完成，请刷新重试' }); }
  };
  router.use(require('../middleware/staffAuth'), wrap(async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.patientId) || !service.validYear(req.params.year)) fail('客户或年度无效', 400);
    await visible(req, req.params.patientId);
    require('../utils/healthManagementRollout').assertPatientEnabled(req.params.patientId);
    if (req.method !== 'GET' && !['familyDoctor', 'superadmin'].includes(req.staff.role)) fail('仅健康顾问可生成和审核', 403);
    req.annualProblemScope = { patientId: req.params.patientId, year: Number(req.params.year) };
    next();
  }));
  router.get('/', wrap(async (req, res) => {
    const scope = req.annualProblemScope;
    const row = await Model.findOne(scope).lean();
    const context = await service.loadContext(scope.patientId, scope.year);
    res.json({ success: true, data: present(row), reportCount: context.reports.length,
      stale: !!row?.sourceFingerprint && row.sourceFingerprint !== context.sourceFingerprint });
  }));
  router.post('/generate', wrap(async (req, res) => {
    const scope = req.annualProblemScope;
    const context = await service.loadContext(scope.patientId, scope.year);
    if (!context.reports.length) fail('本年度暂无已审核且已标明年度的报告', 400);
    let row;
    try { row = await Model.findOneAndUpdate(scope, { $setOnInsert: { ...scope, status: 'empty', __v: 0 } }, { upsert: true, new: true }).lean(); }
    catch (error) { if (error.code !== 11000) throw error; row = await Model.findOne(scope).lean(); }
    if (req.body.revision !== row.__v && !(req.body.revision == null && row.status === 'empty')) fail('内容已更新，请刷新');
    if (row.status === 'generating' && !service.timedOut(row)) fail('正在综合整理，请稍后查看');
    const next = await Model.findOneAndUpdate({ _id: row._id, __v: row.__v, status: row.status }, {
      $set: { status: 'generating', generationToken: randomUUID(), startedAt: new Date(), message: '正在汇总多份报告，整合管理问题并生成分析与建议。' },
      $inc: { __v: 1 }, ...(row.topics?.length ? { $push: { history: snapshot(row) } } : {}),
    }, { new: true }).lean();
    if (!next) fail('已有其他生成操作，请刷新');
    res.status(202).json({ success: true, data: present(next) });
    setImmediate(() => service.generate(next, context, req.staff).catch(() => {}));
  }));
  router.post('/review', wrap(async (req, res) => {
    const scope = req.annualProblemScope;
    const row = await Model.findOne(scope).lean();
    if (!row || row.status !== 'ready' || req.body.revision !== row.__v) fail('草稿状态已更新，请刷新');
    if (!['save', 'approve'].includes(req.body.action)) fail('审核动作无效', 400);
    const context = await service.loadContext(scope.patientId, scope.year);
    if (context.sourceFingerprint !== row.sourceFingerprint) fail('报告或小结已更新，请重新综合整理');
    const approved = req.body.action === 'approve';
    const topics = service.validateReview(req.body.topics, row.topics || [], approved);
    if (approved && req.body.coverageReviewed !== true) fail('请确认已核对问题及资料范围', 400);
    const next = await Model.findOneAndUpdate({ _id: row._id, __v: row.__v, status: 'ready' }, {
      $set: { topics, status: approved ? 'approved' : 'ready', message: approved ? '已审核，作为年度方案编制依据。' : '修改已保存，待顾问审核。',
        ...(approved ? { reviewedBy: req.staff._id, reviewedAt: new Date() } : {}) },
      $inc: { __v: 1 }, $push: { history: { ...snapshot(row), action: req.body.action, by: req.staff._id } },
    }, { new: true }).lean();
    if (!next) fail('草稿已被其他人更新，请刷新');
    if (approved) {
      const keys = context.reports.filter(report => report.followUpSourceEvent).map(report => `${report._id}:${report.followUpSourceEvent.sequence}:${require('../utils/reportFollowUpSource').sourceDigest(report)}`);
      const Draft = require('../models/ReportFollowUpDraft');
      const previous = keys.length ? await Draft.find({ patientId: scope.patientId, purpose: 'annual_report_input', sourceKey: { $in: keys } }).select('_id').lean() : [];
      if (previous.length) {
        await Draft.updateMany({ _id: { $in: previous.map(item => item._id) } }, { $set: { consolidatedReviewId: next._id } });
        for (const item of previous) await require('../utils/reportFollowUpAutomation').completeReportReview(item._id);
      }
    }
    res.json({ success: true, data: present(next) });
  }));
  return router;
};
