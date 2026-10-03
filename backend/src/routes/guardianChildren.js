const express = require('express');
const User = require('../models/User');
const ChildGuardianLink = require('../models/ChildGuardianLink');
const { childAgeStage } = require('../utils/childAgeStage');
const { guardianChild } = require('../utils/guardianChildAccess');
const { ensureChildQuestionnairePush } = require('../utils/childQuestionnaireAutoPush');

const router = express.Router();
const RELATIONS = new Set(['父亲', '母亲', '其他监护人']);

router.get('/', async (req, res) => {
  try {
    const links = await ChildGuardianLink.find({ guardian: req.user._id, status: 'active' })
      .populate('child', 'name gender birthDate patientCategory isDeleted childArchiveFirstResponseId childArchiveImportPending tenantId')
      .sort({ createdAt: -1 }).lean();
    const children = links.filter(link => link.child && !link.child.isDeleted && link.child.patientCategory === 'child'
      && childAgeStage(link.child.birthDate)
      && String(link.child.tenantId || '') === String(req.user.tenantId || '')).map(link => ({
      id: link.child._id, name: link.child.name, gender: link.child.gender, birthDate: link.child.birthDate,
      relation: link.relation, ageStage: childAgeStage(link.child.birthDate),
      questionnaireStarted: !!link.child.childArchiveFirstResponseId,
      archivePending: !!link.child.childArchiveImportPending,
    }));
    res.json({ success: true, data: children });
  } catch (error) { res.status(500).json({ success: false, message: '获取儿童档案失败' }); }
});

router.post('/', async (req, res) => {
  try {
    const guardian = await User.findById(req.user._id).select('patientCategory onboardingCompleted tenantId assignedHealthPlanner assignedHealthManager assignedFamilyDoctor clientBrand residence').lean();
    if (!guardian?.onboardingCompleted || guardian.patientCategory !== 'adult') return res.status(403).json({ success: false, message: '请先完成监护人本人建档' });
    const name = String(req.body?.name || '').trim();
    const birthDate = String(req.body?.birthDate || '').trim();
    const gender = String(req.body?.gender || '未知').trim();
    const relation = String(req.body?.relation || '').trim();
    const idNumber = String(req.body?.idNumber || '').replace(/\s+/g, '').toUpperCase();
    if (!name || name.length > 40 || !childAgeStage(birthDate) || !['男', '女', '未知'].includes(gender)
      || !RELATIONS.has(relation)) return res.status(400).json({ success: false, message: '请核对孩子姓名、出生日期、性别和监护关系' });
    if (req.body?.guardianConsent !== true) return res.status(400).json({ success: false, message: '请确认监护人身份并同意为孩子建立健康档案' });
    if (idNumber) {
      const parsed = require('../utils/idCard').parseIdCard(idNumber);
      if (!parsed || parsed.birthDate !== birthDate || (gender !== '未知' && parsed.gender !== gender)) {
        return res.status(400).json({ success: false, message: '孩子证件号与出生日期或性别不一致' });
      }
      if (await User.exists({ idNumber, isDeleted: { $ne: true } })) {
        return res.status(409).json({ success: false, message: '孩子已有档案，请联系医护人员核实并关联，避免重复建档' });
      }
    }
    const existing = await ChildGuardianLink.find({ guardian: guardian._id, status: 'active' }).select('child').lean();
    if (existing.length && await User.exists({ _id: { $in: existing.map(item => item.child) }, name, birthDate,
      patientCategory: 'child', isDeleted: { $ne: true } })) {
      return res.status(409).json({ success: false, message: '您已为这名孩子建档，请返回家庭成员列表查看' });
    }
    const child = await User.create({ name, birthDate, gender,
      age: require('../utils/idCard').calcAgeFromBirthDate(birthDate),
      ...(idNumber ? { idNumber } : {}),
      patientCategory: 'child', tenantId: guardian.tenantId || null, onboardingCompleted: true,
      assignedHealthPlanner: guardian.assignedHealthPlanner || null,
      assignedHealthManager: guardian.assignedHealthManager || null,
      assignedFamilyDoctor: guardian.assignedFamilyDoctor || null,
      clientBrand: guardian.clientBrand || '', residence: guardian.residence || undefined,
      source: '监护人家庭成员建档' });
    try {
      await ChildGuardianLink.create({ child: child._id, guardian: guardian._id, relation,
        consentAt: new Date(), createdByGuardian: true });
    } catch (error) {
      await User.deleteOne({ _id: child._id });
      throw error;
    }
    res.status(201).json({ success: true, data: { id: child._id, name, birthDate, gender, relation },
      message: '孩子的基础档案已建立，健康问卷可稍后填写' });
  } catch (error) { res.status(500).json({ success: false, message: '儿童建档失败，请稍后重试' }); }
});

router.get('/:childId/archive', async (req, res) => {
  try {
    const access = await guardianChild(req.user, req.params.childId);
    if (!access) return res.status(403).json({ success: false, message: '没有这份儿童档案的监护权限' });
    const child = access.child;
    const pending = (child.childArchiveSubmissions || []).filter(row => row.status === 'pending');
    res.json({ success: true, data: { id: child._id, name: child.name, birthDate: child.birthDate,
      gender: child.gender, ageStage: childAgeStage(child.birthDate), childProfile: child.childProfile || {},
      bloodTypeABO: child.bloodTypeABO || '', bloodTypeRH: child.bloodTypeRH || '',
      pendingReviewCount: pending.length, pendingPaths: [...new Set(pending.flatMap(row => (row.items || []).map(item => item.path)))],
      importPending: !!child.childArchiveImportPending } });
  } catch (error) { res.status(500).json({ success: false, message: '获取儿童档案失败' }); }
});

router.post('/:childId/questionnaire/start', async (req, res) => {
  try {
    const access = await guardianChild(req.user, req.params.childId);
    if (!access) return res.status(403).json({ success: false, message: '没有这份儿童档案的监护权限' });
    const result = await ensureChildQuestionnairePush(access.child);
    if (['missing_template', 'missing_staff', 'missing_age'].includes(result)) return res.status(409).json({ success: false, message: '儿童问卷暂不可用，请联系医护人员' });
    if (result === 'archive_review_pending') return res.status(409).json({ success: false, message: '上一份问卷待医护恢复承接' });
    res.json({ success: true, data: { childId: access.child._id, pushStatus: result } });
  } catch (error) { res.status(500).json({ success: false, message: '打开儿童问卷失败' }); }
});

module.exports = router;
