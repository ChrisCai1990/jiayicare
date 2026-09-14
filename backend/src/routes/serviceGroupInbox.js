// Authenticated material queue; official collection is a separate, disabled-by-default service.
const Message = require('../models/ServiceGroupMessage');
const Receipt = require('../models/ServiceGroupReceipt');
const Report = require('../models/MedicalReport');
const {checkedDate,same} = require('../utils/serviceGroupRules');
module.exports = function install(router, {wrap,group,member,permit,fail,oid,text}) {
  router.post('/:groupId/inbox/sender-binding',wrap(async(req,res)=>{
    const g=await group(req);
    if(!g.archiveConsent)fail('本群存档授权未开启',403);
    await permit(req,'patients','edit');
    const p=await member(req,g,req.body.patientId);
    if(!p)fail('请选择发送人对应的家庭成员');
    const ids=req.body.messageIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>9)fail('请选择该发送人的资料');
    ids.forEach(oid);
    const rows=await Message.find({_id:{$in:ids},groupId:g._id,expiresAt:{$gt:new Date()}}).lean();
    if(rows.length!==new Set(ids).size||new Set(rows.map(m=>m.sender)).size!==1)fail('请只选择同一发送人的资料');
    const sender=rows[0].sender,existing=g.senderBindings.find(b=>b.sender===sender);
    if(existing&&!same(existing.patientId,p._id))fail('发送人已关联其他成员，请核对；代发资料可单独改选归档成员',409);
    if(!existing){
      g.senderBindings.push({sender,patientId:p._id,boundBy:req.staff._id,boundAt:new Date()});
      g.revisions.push({actor:req.staff._id,action:'确认群资料发送人与家庭成员对应关系'});
      await g.save();
    }
    res.json({success:true,data:{patientId:p._id}});
  }));
  router.get('/:groupId/inbox',wrap(async(req,res)=>{
    const g = await group(req);
    if (!g.archiveConsent) return res.json({success:true,data:[]});
    const rows = await Message.find({groupId:g._id,expiresAt:{$gt:new Date()},'attachment.ossKey':{$gt:''}})
      .select('+attachment.ossKey').sort({sentAt:-1}).limit(100).lean();
    const receipts = await Receipt.find({groupId:g._id,messageId:{$in:rows.map(m=>m._id)}}).lean();
    res.json({success:true,data:rows.filter(m=>m.attachment?.ossKey).map(m=>{
      const r = receipts.find(r=>same(r.messageId,m._id));
      const binding=g.senderBindings.find(b=>b.sender===m.sender&&g.members.some(member=>same(member.patientId,b.patientId)));
      return {_id:m._id,sender:m.sender,sentAt:m.sentAt,name:m.attachment.name,
        mimeType:m.attachment.mimeType,size:m.attachment.size,
        previewUrl:require('../utils/oss').getSignedUrl(m.attachment.ossKey,120),
        state:r?.state || 'pending', patientId:r?.patientId, senderPatientId:binding?.patientId, purpose:r?.purpose,
        title:r?.title,date:r?.date,documentCategory:r?.documentCategory,resultId:r?.resultId};
    })});
  }));
  router.post('/:groupId/inbox/confirm',wrap(async(req,res)=>{
    const g=await group(req);
    if(!g.archiveConsent) fail('本群存档授权未开启',403);
    const p=await member(req,g,req.body.patientId);
    if(!p) fail('请选择具体家庭成员');
    const purpose=req.body.purpose;
    if(!['checkin','report'].includes(purpose)) fail('请选择打卡原图或就诊资料');
    await permit(req,purpose==='report'?'reports':'service_records','create');
    const ids=req.body.messageIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>9||new Set(ids).size!==ids.length) fail('每次选择1–9份原件');
    ids.forEach(oid);
    const title=text(req.body.title,160), date=text(req.body.date,10);
    if(!title||!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('请填写名称和资料日期');
    checkedDate(date);
    const category=text(req.body.documentCategory,40);
    if(purpose==='report'&&!Report.schema.path('documentCategory').enumValues.includes(category)) fail('资料类别无效');
    if(req.body.schedule === true) {
      if(process.env.SERVICE_GROUP_MATERIAL_SCHEDULE_ENABLED !== 'true') fail('定时归档尚未启用',409);
      const results=[];
      for(const id of ids) {
        const m=await Message.findOne({_id:id,groupId:g._id,expiresAt:{$gt:new Date()}}).select('+attachment.ossKey');
        if(!m?.attachment?.ossKey || (purpose==='checkin'&&!m.attachment.mimeType?.startsWith('image/'))) fail('所选原件已过期或类型不符');
      }
      for(const id of ids) {
        const existing=await Receipt.findOne({groupId:g._id,messageId:id});
        if(existing) {
          if(!same(existing.patientId,p._id)||existing.purpose!==purpose||existing.title!==title||existing.date!==date||existing.documentCategory!==category) fail('该原件已有确认信息，不能重复改绑',409);
          if(existing.state==='archived') {results.push({messageId:id,success:true,duplicate:true});continue;}
          if(existing.state==='processing') fail('原件正在归档，请稍后刷新',409);
          await Receipt.updateOne({_id:existing._id,state:{$in:['queued','failed']}},{$set:{state:'queued',autoScheduled:true,scheduledAt:new Date(),staffId:req.staff._id}});
        } else {
          await Receipt.create({groupId:g._id,messageId:id,patientId:p._id,purpose,title,date,documentCategory:category,staffId:req.staff._id,state:'queued',autoScheduled:true,scheduledAt:new Date()});
        }
        results.push({messageId:id,success:true,queued:true});
      }
      return res.json({success:true,data:results});
    }
    const results=await require('../utils/archiveGroupMaterials')({g,p,staff:req.staff,ids,purpose,title,date,category});
    res.json({success:true,data:results});
  }));
};
