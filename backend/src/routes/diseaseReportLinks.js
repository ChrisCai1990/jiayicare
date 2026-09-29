const routerFactory = require('express').Router;
const staffAuth = require('../middleware/staffAuth');
const User = require('../models/User');
const MedicalReport = require('../models/MedicalReport');
const { sourceIds, findReportArchive } = require('../../../shared/diseaseReportArchive.cjs');
module.exports = ({ getVisiblePlanPatientIds }) => {
  const router = routerFactory();
  router.post('/:id/disease-records/:recordId/report-links', staffAuth, async (req,res) => {
    try {
      if (!['familyDoctor','superadmin'].includes(req.staff.role)) return res.status(403).json({success:false,message:'仅健康顾问可核对病历来源'});
      const scope=await getVisiblePlanPatientIds(req.staff);
      if(scope && !scope.some(id=>String(id)===req.params.id)) return res.status(403).json({success:false,message:'无此会员权限'});
      const patient=await User.findById(req.params.id).select('diseaseRecords').lean();
      const report=await MedicalReport.findOne({_id:req.body.reportId,user:req.params.id,audit_status:'audited'}).select('_id title').lean();
      if(!patient || !report) return res.status(404).json({success:false,message:'会员或已审核来源病历不存在'});
      const existing=findReportArchive(patient.diseaseRecords,report._id);
      if(existing) return res.json({success:true,data:{alreadyArchived:true,archive:existing},unchanged:true});
      const record=patient.diseaseRecords?.find(r=>String(r._id)===req.params.recordId);
      const entry=record?.courseEntries?.find(e=>String(e._id)===req.body.entryId);
      if(!entry || entry.verificationStatus==='pending_verification') return res.status(400).json({success:false,message:'请选择已归档且已核对的原诊疗记录'});
      const now=new Date();
      const nextEntry={...entry,sourceReportIds:[...sourceIds(entry),String(report._id)],updatedAt:now,updatedByName:req.staff.name || req.staff.username,
        sourceLinkHistory:[...(entry.sourceLinkHistory || []),{reportId:report._id,title:report.title,linkedAt:now,linkedBy:req.staff._id,linkedByName:req.staff.name || req.staff.username}]};
      const records=patient.diseaseRecords.map(r=>r===record?{...r,courseEntries:r.courseEntries.map(e=>e===entry?nextEntry:e)}:r);
      const saved=await User.collection.updateOne({_id:patient._id,diseaseRecords:patient.diseaseRecords},{$set:{diseaseRecords:records}});
      if(!saved.matchedCount) return res.status(409).json({success:false,message:'档案已变化，请刷新后核对'});
      res.json({success:true,data:{alreadyArchived:true,archive:{recordId:String(record._id),diseaseName:record.name,entry:nextEntry}}});
    }catch(e){res.status(400).json({success:false,message:e.message})}
  });
  return router;
};
