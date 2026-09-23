const express = require('express'), multer = require('multer'), mongoose = require('mongoose');
const { createHash } = require('crypto');
const { runtime } = require('../utils/careFlowRuntime');
const { fail, text } = require('../utils/careFlowState');
const config = require('../../../shared/careFlow.cjs');
const router = express.Router(), api = runtime();
const wrap = fn => async(req,res) => { try { res.set('Cache-Control','no-store'); await fn(req,res); } catch(e) { res.status(e.statusCode || 500).json({message:e.message}); } };
router.use(require('../middleware/staffAuth'));
router.use((req,res,next) => require('../middleware/checkPermission')('followups',req.method === 'GET' ? 'view' : 'edit')(req,res,next));
router.use((req,res,next) => req.staff.staffStatus === 'inactive' || req.staff.mustChangePassword ? res.status(403).json({message:'请检查账号状态并修改初始密码'}) : next());
router.param('id',(req,res,next,value) => mongoose.isValidObjectId(value) ? next() : res.status(400).json({message:'标识无效'}));
async function output(flow,actor) {
  if(flow.unstarted) return flow;
  const reportRows = await api.models.Report.find({_id:{$in:flow.state.data.upload?.reportIds || []},user:flow.patientId,tenantId:flow.tenantId}).lean();
  const reports = await Promise.all(reportRows.map(async r => ({_id:r._id,title:r.title,audit_status:r.audit_status,url:await require('../utils/oss').signStoredUrl(r.fileUrl)})));
  const assistants = actor.role === 'healthPlanner' || actor.role === 'superadmin' ? await require('../models/Admin').find({role:'medicalAssistant',staffStatus:'active',tenantId:actor.tenantId || null}).select('name role').lean() : [];
  const manager = actor.role==='superadmin'||(actor.role==='healthManager'&&String(flow.state.people.healthManager?.id)===String(actor._id));
  const availableReports = manager && ['upload','audit'].includes(flow.state.stage) ? await api.models.Report.find({user:flow.patientId,tenantId:flow.tenantId}).select('_id title checkDate audit_status').sort({createdAt:-1}).limit(100).lean() : [];
  return {...flow,reports,assistants,availableReports};
}
router.get('/task/:id',wrap(async(req,res)=>res.json({data:await output(await api.resolve(req.params.id,req.staff),req.staff)})));
router.post('/task/:id/start',wrap(async(req,res)=>res.json({data:await output(await api.start(req.params.id,req.staff),req.staff)})));
router.get('/:id',wrap(async(req,res)=>res.json({data:await output(await api.view(req.params.id,req.staff),req.staff)})));
router.post('/:id/action',wrap(async(req,res)=>{
  let flow = await api.action(req.params.id,req.staff,req.body);
  if(flow.state.stage === 'draft') {
    try { flow = await require('../utils/careFlowDraft').generate(api,flow._id,req.staff,true); }
    catch(e) { flow = await api.view(flow._id,req.staff); }
  }
  res.json({data:await output(flow,req.staff)});
}));
router.post('/:id/generate',wrap(async(req,res)=>res.json({data:await output(await require('../utils/careFlowDraft').generate(api,req.params.id,req.staff),req.staff)})));
// Authenticate stage ownership before accepting bytes. Report originals are additive,
// stored in existing report management, and never auto-audited by this upload.
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1}});
router.post('/:id/reports',async(req,res,next)=>{
  try {
    const f=await api.view(req.params.id,req.staff);
    if(f.state.stage!=='upload' || (req.staff.role!=='superadmin' && (req.staff.role!=='healthManager' || String(f.state.people.healthManager.id)!==String(req.staff._id)))) fail('仅本次健管专员可上传',403);
    req.flow=f;next();
  }catch(e){res.status(e.statusCode||500).json({message:e.message});}
},upload.single('file'),wrap(async(req,res)=>{
  const f=req.flow, file=req.file;
  const mime=file && require('../utils/serviceGroupRules').fileMime(file.buffer);
  if(!mime) fail('仅支持可识别的PDF或图片',400);
  const category=req.body.category;
  if(!['outpatient_record','prescription_order','exam_report'].includes(category))fail('请选择资料类型',400);
  const title=text(req.body.title,200);
  const reportId=createHash('sha256').update(`${f._id}:${category}:`).update(file.buffer).digest('hex').slice(0,24);
  let report=await api.models.Report.findOne({_id:reportId,user:f.patientId,tenantId:f.tenantId}).lean();
  if(!report){
    const saved=await require('../utils/oss').uploadBuffer(file.buffer,mime,'reports');
    report=await api.models.Report.findOneAndUpdate({_id:reportId,user:f.patientId,tenantId:f.tenantId},{$setOnInsert:{title,type:'other',documentCategory:category,
      fileUrl:saved.url,ossKey:saved.key,mimeType:mime,fileSize:String(file.size),uploadedBy:req.staff._id,uploadedByRole:req.staff.role,sourceType:'staff_upload',audit_status:'unaudited',aiStatus:'none',note:`本次就医协助资料 ${f._id}`}}, {upsert:true,new:true}).lean();
  }
  const ids=[...new Set([...(f.state.data.upload?.reportIds||[]).map(String),String(report._id)])];
  if(ids.length>50)fail('单次服务最多50份资料');
  const saved=await api.models.Flow.updateOne({_id:f._id,tenantId:f.tenantId,revision:f.revision},{$set:{'state.data.upload.reportIds':ids},$inc:{revision:1},$push:{events:{action:'upload',stage:'upload',at:new Date(),by:String(req.staff._id),name:req.staff.name,reportId:String(report._id),title}}});
  if(!saved.modifiedCount)fail('上传期间环节已变化；原件已保留在报告管理，请刷新后重试关联');
  res.json({data:await output(await api.view(f._id,req.staff),req.staff)});
}));
module.exports=router;
