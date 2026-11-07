const mongoose = require('mongoose');
const staffAuth = require('./staffAuth');
module.exports = async (req, res, next) => {
  const match = /^\/(plans|service-records)\/([a-f\d]{24})(?:\/|$)/i.exec(req.path);
  if (!match) return next();
  const Model = require('../models/' + (match[1] === 'plans' ? 'HealthPlan' : 'ServiceRecord'));
  const record = await Model.findById(new mongoose.Types.ObjectId(match[2])).select('type patientId').lean();
  if (record?.type !== 'psychology') return next();
  return staffAuth(req, res, () => {
    (async () => {
    if (req.method !== 'GET') return res.status(409).json({ success: false, message: '历史心理资料只读，请从心理咨询工作台追加记录' });
    const patient = req.staff.role === 'familyDoctor' && await require('../models/User').exists({ _id: record.patientId, tenantId: req.staff.tenantId, assignedFamilyDoctor: req.staff._id, isDeleted: { $ne: true } });
    if (!patient) return res.status(403).json({ success: false, message: '无权查看心理咨询资料' });
    res.set('Cache-Control', 'no-store');
    next();
    })().catch(next);
  });
};
