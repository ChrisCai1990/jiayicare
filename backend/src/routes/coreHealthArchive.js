const express = require('express');
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const checkPermission = require('../middleware/checkPermission');
const User = require('../models/User');
const ChildGuardianLink = require('../models/ChildGuardianLink');
const { childAgeStage } = require('../utils/childAgeStage');
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
  router.put('/:id/child-archive/:responseId/review', staffAuth, checkPermission('patients', 'edit'), async (req, res) => {
    try {
      if (!['healthManager', 'familyDoctor', 'medicalAssistant', 'superadmin', 'platformSuper'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '请由负责此客户的医护人员核实' });
      if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.responseId)) return res.status(400).json({ success: false, message: '编号无效' });
      const scope = await getVisiblePlanPatientIds(req.staff);
      if (scope && !scope.some(id => String(id) === req.params.id)) return res.status(403).json({ success: false, message: '无此客户权限' });
      const patient = await User.findById(req.params.id).lean();
      if (!patient || patient.isDeleted) return res.status(404).json({ success: false, message: '客户不存在' });
      const mutation = require('../utils/childArchive').reviewChildSubmission(patient, req.params.responseId, req.body, req.staff);
      const result = await User.collection.updateOne(mutation.filter, mutation.update);
      if (!result.matchedCount) return res.status(409).json({ success: false, message: '儿童档案已变化，请刷新后重新核实' });
      res.json({ success: true });
    } catch (err) { res.status(err.statusCode || 500).json({ success: false, message: err.message }); }
  });
  router.post('/:id/child-guardians/:linkId/verify', staffAuth, checkPermission('patients', 'edit'), async (req, res) => {
    try {
      if (!['healthManager', 'familyDoctor', 'medicalAssistant', 'superadmin', 'platformSuper'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '请由负责此客户的医护人员核实' });
      if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.linkId)) return res.status(400).json({ success: false, message: '编号无效' });
      const scope = await getVisiblePlanPatientIds(req.staff);
      if (scope && !scope.some(id => String(id) === req.params.id)) return res.status(403).json({ success: false, message: '无此客户权限' });
      const note = String(req.body?.note || '').trim();
      if (!note || note.length > 1000) return res.status(400).json({ success: false, message: '请填写监护关系核实依据' });
      const link = await require('../models/ChildGuardianLink').findOneAndUpdate({ _id: req.params.linkId,
        child: req.params.id, status: 'active', verifiedAt: null }, { $set: {
        verifiedAt: new Date(), verifiedBy: req.staff._id, verificationNote: note,
      } }, { new: true }).lean();
      if (!link) return res.status(409).json({ success: false, message: '关系已核实或已变化，请刷新' });
      res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, message: '核实监护关系失败' }); }
  });
  router.post('/:id/child-guardians/link', staffAuth, checkPermission('patients', 'edit'), async (req, res) => {
    try {
      if (!['healthManager', 'familyDoctor', 'medicalAssistant', 'superadmin', 'platformSuper'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '请由负责此客户的医护人员关联' });
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '儿童编号无效' });
      const scope = await getVisiblePlanPatientIds(req.staff);
      if (scope && !scope.some(id => String(id) === req.params.id)) return res.status(403).json({ success: false, message: '无此客户权限' });
      const child = await User.findById(req.params.id).select('patientCategory birthDate tenantId isDeleted').lean();
      if (!child || child.isDeleted || child.patientCategory !== 'child' || !childAgeStage(child.birthDate)
        || String(child.tenantId || '') !== String(req.staff.tenantId || '')) return res.status(404).json({ success: false, message: '未找到有效的未成年儿童档案' });
      const phone = String(req.body?.guardianPhone || '').trim();
      const relation = String(req.body?.relation || '').trim();
      const note = String(req.body?.note || '').trim();
      if (!/^1\d{10}$/.test(phone) || !['父亲', '母亲', '其他监护人'].includes(relation)
        || !note || note.length > 1000 || req.body?.consentConfirmed !== true) {
        return res.status(400).json({ success: false, message: '请填写监护人手机号、关系、核实依据并确认已取得监护人同意' });
      }
      const guardian = await User.findOne({ phone, patientCategory: 'adult', onboardingCompleted: true,
        tenantId: child.tenantId || null, isDeleted: { $ne: true } }).select('_id name').lean();
      if (!guardian) return res.status(404).json({ success: false, message: '未找到本机构已建档的成人监护人' });
      const existing = await ChildGuardianLink.findOne({ child: child._id, guardian: guardian._id }).lean();
      if (existing) return res.status(409).json({ success: false, message: '此监护关系已存在，请核实原记录' });
      await ChildGuardianLink.create({ child: child._id, guardian: guardian._id, relation,
        consentAt: new Date(), createdByGuardian: false, verifiedAt: new Date(),
        verifiedBy: req.staff._id, verificationNote: note });
      res.status(201).json({ success: true, data: { guardianName: guardian.name } });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ success: false, message: '此监护关系已存在' });
      res.status(500).json({ success: false, message: '关联监护人失败' });
    }
  });
  router.put('/:id/child-archive/manual', staffAuth, checkPermission('patients', 'edit'), async (req, res) => {
    try {
      if (!['healthManager', 'familyDoctor', 'medicalAssistant', 'superadmin', 'platformSuper'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '请由负责此客户的医护人员更新' });
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '客户编号无效' });
      const scope = await getVisiblePlanPatientIds(req.staff);
      if (scope && !scope.some(id => String(id) === req.params.id)) return res.status(403).json({ success: false, message: '无此客户权限' });
      const patient = await User.findById(req.params.id).lean();
      if (!patient || patient.isDeleted) return res.status(404).json({ success: false, message: '客户不存在' });
      const mutation = require('../utils/childArchive').manualChildUpdate(patient, req.body, req.staff);
      const result = await User.collection.updateOne(mutation.filter, mutation.update);
      if (!result.matchedCount) return res.status(409).json({ success: false, message: '儿童档案已变化，请刷新后重试' });
      res.json({ success: true });
    } catch (err) { res.status(err.statusCode || 500).json({ success: false, message: err.message }); }
  });
  router.post('/:id/child-archive/standard-records', staffAuth, checkPermission('patients', 'edit'), async (req, res) => {
    try {
      if (!['healthManager', 'familyDoctor', 'medicalAssistant', 'superadmin', 'platformSuper'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '请由负责此客户的医护人员录入' });
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '客户编号无效' });
      const scope = await getVisiblePlanPatientIds(req.staff);
      if (scope && !scope.some(id => String(id) === req.params.id)) return res.status(403).json({ success: false, message: '无此客户权限' });
      const patient = await User.findById(req.params.id).lean();
      if (!patient || patient.isDeleted) return res.status(404).json({ success: false, message: '客户不存在' });
      const mutation = require('../utils/childStandardRecord').createChildStandardRecord(patient, req.body, req.staff);
      const result = await User.collection.updateOne(mutation.filter, mutation.update);
      if (!result.matchedCount) return res.status(409).json({ success: false, message: '同一访视节点和日期已有记录，或出生日期已变化，请刷新后核实' });
      res.json({ success: true, data: mutation.record });
    } catch (err) { res.status(err.statusCode || 500).json({ success: false, message: err.message }); }
  });
  router.post('/:id/child-archive/retry', staffAuth, checkPermission('patients', 'edit'), async (req, res) => {
    try {
      if (!['healthManager', 'familyDoctor', 'superadmin', 'platformSuper'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '请由健管专员处理' });
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '客户编号无效' });
      const scope = await getVisiblePlanPatientIds(req.staff);
      if (scope && !scope.some(id => String(id) === req.params.id)) return res.status(403).json({ success: false, message: '无此客户权限' });
      const patient = await User.findById(req.params.id).lean();
      const responseId = patient?.childArchiveImportPending?.responseId;
      if (!responseId) return res.status(409).json({ success: false, message: '没有待恢复的儿童问卷' });
      const { QuestionnaireResponse, DynamicQuestionnaire } = require('../models/DynamicQuestionnaire');
      const response = await QuestionnaireResponse.findOne({ _id: responseId, user: patient._id }).lean();
      const questionnaire = response && await DynamicQuestionnaire.findById(response.questionnaire).lean();
      if (!questionnaire || questionnaire.archivePurpose !== 'child_health') return res.status(404).json({ success: false, message: '来源儿童问卷不存在' });
      const { initialChildMutation, followupChildMutation } = require('../utils/childArchive');
      const sourceQuestionnaire = response.questionnaireSnapshot ? { ...questionnaire,
        title: response.questionnaireSnapshot.title, questions: response.questionnaireSnapshot.questions } : questionnaire;
      let mutation;
      if (!patient.childArchiveFirstResponseId) mutation = initialChildMutation(patient, sourceQuestionnaire, response);
      else mutation = followupChildMutation(patient, sourceQuestionnaire, response);
      mutation.filter['childArchiveImportPending.responseId'] = responseId;
      mutation.update.$set = { ...(mutation.update.$set || {}), childArchiveImportPending: null };
      const result = await User.collection.updateOne(mutation.filter, mutation.update);
      if (!result.matchedCount) return res.status(409).json({ success: false, message: '档案已变化，请刷新后重试' });
      res.json({ success: true });
    } catch (err) { res.status(err.statusCode || 500).json({ success: false, message: err.message }); }
  });
  return router;
};
