// Authenticated material queue; official collection is a separate, disabled-by-default service.
const Message = require('../models/ServiceGroupMessage');
const Receipt = require('../models/ServiceGroupReceipt');
const Report = require('../models/MedicalReport');
const Record = require('../models/ServiceRecord');
const {createHash} = require('crypto');
const {fileMime,checkedDate,same} = require('../utils/serviceGroupRules');
module.exports = function install(router, {wrap,group,member,permit,fail,oid,text}) {
  router.get('/:groupId/inbox',wrap(async(req,res)=>{
    const g = await group(req);
    if (!g.archiveConsent) return res.json({success:true,data:[]});
    const rows = await Message.find({groupId:g._id,expiresAt:{$gt:new Date()}})
      .select('+attachment.ossKey').sort({sentAt:-1}).limit(100).lean();
    const receipts = await Receipt.find({groupId:g._id,messageId:{$in:rows.map(m=>m._id)}}).lean();
    res.json({success:true,data:rows.filter(m=>m.attachment?.ossKey).map(m=>{
      const r = receipts.find(r=>same(r.messageId,m._id));
      return {_id:m._id,sender:m.sender,sentAt:m.sentAt,name:m.attachment.name,
        mimeType:m.attachment.mimeType,size:m.attachment.size,
        previewUrl:require('../utils/oss').getSignedUrl(m.attachment.ossKey,120),
        state:r?.state || 'pending', patientId:r?.patientId, purpose:r?.purpose,
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
    const results=[];
    for(const id of ids){
      let receipt, owned=false;
      try {
        const m=await Message.findOne({_id:id,groupId:g._id,expiresAt:{$gt:new Date()}}).select('+attachment.ossKey');
        if(!m?.attachment?.ossKey?.startsWith('service-group-staging/')) fail('原件已过期或不属于当前群',404);
        if(purpose==='checkin'&&!m.attachment.mimeType?.startsWith('image/')) fail('打卡仅支持图片');
        receipt=await Receipt.findOne({groupId:g._id,messageId:id});
        if(receipt){
          if(!same(receipt.patientId,p._id)||receipt.purpose!==purpose||receipt.title!==title||receipt.date!==date||receipt.documentCategory!==category)
            fail('该原件已有确认记录，请核对已确认的成员、名称和分类，不能重复改绑',409);
          if(receipt.state==='archived') {results.push({messageId:id,success:true,resultId:receipt.resultId,duplicate:true});continue;}
          receipt=await Receipt.findOneAndUpdate({_id:receipt._id,state:'failed'},{$set:{state:'processing'}},{new:true});
          if(!receipt) fail('该原件正在处理，请勿重复提交；长时间未完成请联系管理员核对',409);
        }else{
          receipt=await Receipt.create({groupId:g._id,messageId:id,patientId:p._id,purpose,title,date,documentCategory:category,staffId:req.staff._id});
        }
        owned=true;
        const oss=require('../utils/oss');
        const stream=(await oss.getObjectStream(m.attachment.ossKey)).stream;
        const chunks=[]; let size=0;
        for await(const chunk of stream){size+=chunk.length;if(size>20*1024*1024){stream.destroy();fail('原件超过20MB');}chunks.push(chunk);}
        const buffer=Buffer.concat(chunks),mime=fileMime(buffer),digest=createHash('sha256').update(buffer).digest('hex');
        if(!mime||digest!==m.attachment.sha256) fail('原件校验失败，请联系管理员');
        const Model=purpose==='report'?Report:Record;
        const filter=purpose==='report'?{user:p._id,sourceSha256:digest}:{patientId:p._id,sourceGroupImageSha256:digest};
        let result=await Model.findOne(filter), duplicate=!!result;
        if(!result){
          const file=await oss.uploadBuffer(buffer,mime,purpose==='report'?'reports':'service-group-checkins');
          try {
            result=await Model.create(purpose==='report'?{
              user:p._id,tenantId:p.tenantId||null,title,documentCategory:category,type:'other',date,checkDate:date,
              fileUrl:file.url,fileUrls:[file.url],ossKey:file.key,ossKeys:[file.key],mimeType:mime,fileSize:String(size),
              sourceSha256:digest,sourceServiceGroup:g._id,sourceGroupMessageId:m.messageId,uploadedBy:req.staff._id,uploadedByRole:req.staff.role,
              aiStatus:'none',audit_status:'unaudited',
            }:{patientId:p._id,staffId:req.staff._id,type:'group_service',title:'打卡原图 · '+title,date:checkedDate(date),
              content:'医护确认归档的群打卡原图；未自动提取数值，不代表指标已审核。',
              sourceGroupImageSha256:digest,sourceGroupMessageId:m.messageId,
              attachments:[{url:file.url,ossKey:file.key,name:m.attachment.name,mimeType:mime,fileSize:String(size)}]});
          }catch(e){await oss.deleteFile(file.key);if(e.code!==11000)throw e;result=await Model.findOne(filter);if(!result)throw e;duplicate=true;}
        }
        await Receipt.updateOne({_id:receipt._id},{$set:{state:'archived',resultId:result._id,duplicate}});
        results.push({messageId:id,success:true,resultId:result._id,duplicate});
      }catch(e){
        if(owned) await Receipt.updateOne({_id:receipt._id},{$set:{state:'failed'}});
        results.push({messageId:id,success:false,message:e.status?e.message:'归档未完成，请刷新后重试；仍失败请联系管理员'});
      }
    }
    res.json({success:true,data:results});
  }));
};
