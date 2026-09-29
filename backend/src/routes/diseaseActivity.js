const express = require('express');
const staffAuth = require('../middleware/staffAuth');
const User = require('../models/User');
const HealthPlan = require('../models/HealthPlan');
const ServiceRecord = require('../models/ServiceRecord');
const FollowUp = require('../models/FollowUp');
const HealthRecord = require('../models/HealthRecord');
const { diseaseActivity } = require('../utils/diseaseActivity');

module.exports = ({ getVisiblePlanPatientIds }) => {
  const router = express.Router();
  async function patientFor(req, res) {
    const scope = await getVisiblePlanPatientIds(req.staff);
    if (scope && !scope.some(value => String(value) === req.params.id)) { res.status(403).json({ success: false, message: '无此会员权限' }); return null; }
    const patient = await User.findById(req.params.id).select('diseaseRecords').lean();
    if (!patient) res.status(404).json({ success: false, message: '会员不存在' });
    return patient;
  }
  async function activities(patient) {
    const [plans, records, tasks] = await Promise.all([
      HealthPlan.find({ patientId: patient._id, type: 'medical_assist' }).select('title status startDate createdAt sourceOrderId').lean(),
      ServiceRecord.find({ patientId: patient._id }).select('title type date content result diseaseName sourceHealthPlanId sourceOrderId aiStatus staffId sourcePhaseAssessmentId').populate('staffId', 'name').lean(),
      FollowUp.find({ patientId: patient._id }).select('theme type date status sourceHealthPlanId sourceOrderId assignedTo executedContent').populate('assignedTo', 'name').lean(),
    ]);
    return diseaseActivity({ plans, records: records.filter(r => r.type !== 'phase_assessment' || r.sourcePhaseAssessmentId), tasks, diseases: patient.diseaseRecords || [] });
  }
  router.get('/:id/disease-activity', staffAuth, async (req, res) => {
    try {
      const patient = await patientFor(req, res); if (!patient) return;
      const daily = await HealthRecord.find({ user: patient._id, deletedAt: null, $or: [{ type: 'symptom' }, { status: { $in: ['warning', 'danger'] } }] })
        .select('type label value unit note recordedAt status symptomWorkflow').sort({ recordedAt: -1 }).limit(51).lean();
      res.json({ success: true, data: { activities: await activities(patient), daily: daily.slice(0, 50), dailyHasMore: daily.length > 50 } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });
  router.post('/:id/disease-records/:recordId/service-links', staffAuth, async (req, res) => {
    try {
      if (!['familyDoctor', 'superadmin'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '请由健康顾问确认专病关联' });
      const patient = await patientFor(req, res); if (!patient) return;
      const original = patient.diseaseRecords || [];
      const target = original.find(d => String(d._id) === req.params.recordId);
      if (!target) return res.status(404).json({ success: false, message: '请先保存专病档案' });
      const activity = (await activities(patient)).find(a => a.key === req.body.key);
      if (!activity) return res.status(404).json({ success: false, message: '服务不存在或不属于当前会员' });
      const action = req.body.action || 'link';
      if (!['link','unlink'].includes(action)) return res.status(400).json({ success: false, message: '关联操作无效' });
      const oldKeys = activity.manualLinkKeys[req.params.recordId] || [];
      if (action === 'link' && activity.diseaseIds.includes(req.params.recordId) || action === 'unlink' && !oldKeys.length) return res.json({ success: true, unchanged: true });
      const stamp = { key: activity.key, linkedAt: new Date(), linkedBy: req.staff._id, linkedByName: req.staff.name || '' };
      const next = original.map(d => String(d._id) !== req.params.recordId ? d : { ...d,
        serviceLinks: action === 'link' ? [...(d.serviceLinks || []), stamp] : (d.serviceLinks || []).filter(link => !oldKeys.includes(link.key)),
        serviceLinkHistory: [...(d.serviceLinkHistory || []), { ...stamp, action }],
      });
      const result = await User.collection.updateOne({ _id: patient._id, diseaseRecords: original }, { $set: { diseaseRecords: next } });
      if (!result.matchedCount) return res.status(409).json({ success: false, message: '档案已更新，请刷新后重试' });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });
  return router;
};
