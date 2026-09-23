const router=require('express').Router(), Flow=require('../models/CareFlow');
const {text}=require('../utils/careFlowState');
router.use(require('../middleware/adminAuth'));
router.use((req,res,next)=>req.admin.role==='superadmin' && req.admin.staffStatus!=='inactive'?next():res.status(403).json({message:'仅机构管理员可查看质量记录'}));
router.get('/',async(req,res,next)=>{
  try{
    const filter={tenantId:req.admin.tenantId||null};
    const total=await Flow.countDocuments(filter),rows=await Flow.find(filter).sort({updatedAt:-1}).limit(500).lean();
    res.set('Cache-Control','no-store');res.json({data:{...require('../utils/careQuality').summarize(rows),total,limited:total>500}});
  }catch(e){next(e);}
});
router.post('/:id/review',async(req,res,next)=>{
  try{
    if(!require('mongoose').isValidObjectId(req.params.id))return res.status(400).json({message:'标识无效'});
    const f=await Flow.findOne({_id:req.params.id,tenantId:req.admin.tenantId||null}).lean();
    if(!f || !f.events.some(e=>e.action==='return' && e.token===req.body.token))return res.status(404).json({message:'回退记录不存在'});
    const note=text(req.body.note,3000),improvement=text(req.body.improvement,3000);
    if(typeof req.body.personnelIssueConfirmed!=='boolean')return res.status(400).json({message:'请明确责任是否已复核'});
    const saved=await Flow.updateOne({_id:f._id,tenantId:f.tenantId,revision:f.revision},{$inc:{revision:1},$push:{events:{action:'quality_review',token:req.body.token,at:new Date(),by:String(req.admin._id),name:req.admin.name,note,improvement,personnelIssueConfirmed:req.body.personnelIssueConfirmed}}});
    if(!saved.modifiedCount)return res.status(409).json({message:'记录已更新，请刷新重试'});
    res.json({success:true});
  }catch(e){if(e.statusCode)return res.status(e.statusCode).json({message:e.message});next(e);}
});
module.exports=router;
