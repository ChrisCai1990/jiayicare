const express = require('express');
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const User = require('../models/User');
const MedicalReport = require('../models/MedicalReport');
const { generateDiseaseSummary, recordVersion } = require('../utils/diseaseSummary');
const { baseVersion, stageScope, stageFields } = require('../utils/diseaseStages');
module.exports = ({ getVisiblePlanPatientIds }) => {
  const router = express.Router();
  async function getRecord(req, res) {
    if (!['familyDoctor', 'superadmin'].includes(req.staff.role)) { res.status(403).json({ success:false, message:'仅健康顾问可生成和确认阶段概要' }); return null; }
    const scope = await getVisiblePlanPatientIds(req.staff);
    if (scope && !scope.some(id => String(id) === req.params.id)) { res.status(403).json({ success:false, message:'无此会员权限' }); return null; }
    const patient = await User.findById(req.params.id).select('diseaseRecords').lean();
    const record = patient?.diseaseRecords?.find(r => String(r._id) === req.params.recordId);
    if (!record) { res.status(404).json({ success:false, message:'请先保存首次专病概况' }); return null; }
    return { patient, record };
  }
  const reportsFor = async (patient, ids) => MedicalReport.find({ _id: { $in: ids }, user: patient._id, audit_status:'audited' }).select('title date checkDate hospital institution documentCategory aiSummary reportItems clinicalReview content').sort({ _id:1 }).lean();
  async function save(patient, record, res) {
    const records = patient.diseaseRecords.map(r => String(r._id) === String(record._id) ? record : r);
    const result = await User.collection.updateOne({ _id:patient._id, diseaseRecords:patient.diseaseRecords }, { $set:{ diseaseRecords:records } });
    if (!result.matchedCount) { res.status(409).json({ success:false, message:'资料已更新，请刷新后重新生成' }); return false; }
    return true;
  }
  router.post('/:id/disease-records/:recordId/stage-draft', staffAuth, async (req, res) => {
    try {
      const found = await getRecord(req, res); if (!found) return;
      const { patient, record } = found;
      const scoped = stageScope(record, req.body.cutoff);
      const ids = [...new Set(scoped.record.courseEntries.map(e => String(e.sourceReportId || '')).filter(mongoose.isValidObjectId))];
      const reports = await reportsFor(patient, ids);
      // Reports are evidence for the reviewed timeline; never ingest unrelated/unreviewed uploads.
      if (reports.length !== ids.length) throw new Error('关联报告已变化或尚未审核，请先核对来源资料');
      const result = await generateDiseaseSummary(scoped.record, reports, require('../utils/ai').chat);
      const draft = { _id:new mongoose.Types.ObjectId(), summary:result.summary, cutoff:req.body.cutoff,
        coverage:result.coverage, coveredChanges:scoped.coveredChanges, excludedCount:scoped.excludedCount,
        sourceReports:reports.map(r => ({ id:String(r._id), title:r.title })), reportsVersion:recordVersion(reports),
        baseVersion:baseVersion(record), generatedAt:new Date(), generatedBy:req.staff._id };
      if (!await save(patient, { ...record, stageDraft:draft }, res)) return;
      res.json({ success:true, data:draft });
    } catch (error) { res.status(400).json({ success:false, message:error.message }); }
  });
  router.post('/:id/disease-records/:recordId/stages', staffAuth, async (req, res) => {
    try {
      const found = await getRecord(req, res); if (!found) return;
      const { patient, record } = found;
      const existing = (record.stageSummaries || []).find(s => String(s.draftId) === String(req.body.draftId));
      if (existing) return res.json({ success:true, data:existing, unchanged:true });
      const draft = record.stageDraft;
      if (!draft || String(draft._id) !== req.body.draftId || draft.baseVersion !== baseVersion(record)) return res.status(409).json({ success:false, message:'草稿或专病资料已更新，请重新生成' });
      const reports = await reportsFor(patient, draft.sourceReports.map(r => r.id));
      if (recordVersion(reports) !== draft.reportsVersion) return res.status(409).json({ success:false, message:'来源报告已更新，请重新生成' });
      if ((record.stageSummaries || []).length >= 200) throw new Error('阶段概要已达200份，请联系管理员整理，不会覆盖旧概要');
      const stage = { ...draft, draftId:draft._id, summary:stageFields(req.body.summary || {}), baselineSnapshot:record.summary,
        confirmedAt:new Date(), confirmedById:req.staff._id, confirmedByName:req.staff.name || req.staff.username || '' };
      const next = { ...record, stageDraft:null, stageSummaries:[stage, ...(record.stageSummaries || [])] };
      if (!await save(patient, next, res)) return;
      res.json({ success:true, data:stage });
    } catch (error) { res.status(400).json({ success:false, message:error.message }); }
  });
  return router;
};
