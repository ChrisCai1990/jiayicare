const express = require('express');
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const checkPermission = require('../middleware/checkPermission');
const User = require('../models/User');
const { saveSection, reviewSection } = require('../utils/initialArchiveReview');

module.exports = ({ getVisiblePlanPatientIds }) => {
  const router = express.Router();
  for (const [path, build] of [['core-health-archive', saveSection], ['initial-archive-review', reviewSection]]) {
    router.put(`/:id/${path}/:section`, staffAuth, checkPermission('patients', 'edit'), async (req, res) => {
      try {
        if (!['healthManager', 'familyDoctor', 'medicalAssistant', 'superadmin', 'platformSuper'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '请由负责此客户的健管专员或健康顾问核实' });
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '客户编号无效' });
        const scope = await getVisiblePlanPatientIds(req.staff);
        if (scope && !scope.some(id => String(id) === req.params.id)) return res.status(403).json({ success: false, message: '无此客户权限' });
        const patient = await User.findById(req.params.id).select('coreHealthArchive initialArchiveReview healthProfile').lean();
        if (!patient) return res.status(404).json({ success: false, message: '客户不存在' });
        const mutation = build(patient, req.params.section, req.body, req.staff);
        const result = await User.collection.updateOne(mutation.filter, mutation.update);
        if (!result.matchedCount) return res.status(409).json({ success: false, message: '档案已更新，请刷新后重试' });
        res.json({ success: true });
      } catch (err) { res.status(err.statusCode || 500).json({ success: false, message: err.message }); }
    });
  }
  router.post('/:id/initial-archive-review/retry', staffAuth, checkPermission('patients', 'edit'), async (req, res) => {
    try {
      if (!['healthManager','familyDoctor','superadmin','platformSuper'].includes(req.staff.role)) return res.status(403).json({success:false,message:'请由健管专员处理'});
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({success:false,message:'客户编号无效'});
      const scope = await getVisiblePlanPatientIds(req.staff);
      if (scope && !scope.some(id => String(id) === req.params.id)) return res.status(403).json({success:false,message:'无此客户权限'});
      const patient = await User.findById(req.params.id).lean();
      if (!patient?.initialArchiveImportPending) return res.status(409).json({success:false,message:'没有待重试的写入'});
      const { QuestionnaireResponse, DynamicQuestionnaire } = require('../models/DynamicQuestionnaire');
      const response = await QuestionnaireResponse.findOne({_id:patient.initialArchiveImportPending.responseId,user:patient._id}).lean();
      if (!response) return res.status(404).json({success:false,message:'来源答卷不存在'});
      const questionnaire = await DynamicQuestionnaire.findById(response.questionnaire).lean();
      if (!questionnaire) return res.status(404).json({success:false,message:'来源问卷不存在'});
      const previous = await QuestionnaireResponse.exists({user:patient._id,questionnaire:questionnaire._id,_id:{$lt:response._id}});
      if (previous) return res.status(409).json({success:false,message:'此答卷并非初次问卷，请从原始资料核对后记录变化'});
      const mutation = require('../utils/initialArchiveReview').initialImport(patient, questionnaire, response, require('../utils/archiveImport').buildArchiveDraft(patient,questionnaire,response));
      if (!mutation) return res.status(409).json({success:false,message:'初次建档已处理，请刷新'});
      const result = await User.collection.updateOne(mutation.filter,mutation.update);
      if (!result.matchedCount) return res.status(409).json({success:false,message:'档案已更新，请刷新重试'});
      res.json({success:true});
    } catch(err) {res.status(500).json({success:false,message:err.message});}
  });
  return router;
};
