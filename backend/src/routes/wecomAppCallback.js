const router=require('express').Router();
const express=require('express');
const {createHash,randomBytes}=require('crypto');
const crypto=require('../utils/wecomAppCrypto');
const Link=require('../models/WecomAppLink');
const Material=require('../models/WecomAppMaterial');
const User=require('../models/User');
const MedicalReport=require('../models/MedicalReport');
const {uploadBuffer}=require('../utils/oss');
const {fileMime,canAccessPatient}=require('../utils/serviceGroupRules');
const optional=(xml,name)=>{try{return crypto.field(xml,name)}catch{return ''}};
async function token(){const r=await fetch('https://qyapi.weixin.qq.com/cgi-bin/gettoken?'+new URLSearchParams({corpid:process.env.WECOM_CORP_ID,corpsecret:process.env.WECOM_APP_SECRET}),{signal:AbortSignal.timeout(10000)});const d=await r.json();if(!d.access_token)throw new Error('应用授权失败');return d.access_token;}
async function archive(material,staff,instruction){
  const name=(String(instruction).match(/^\s*([^，,的\s]{1,40})(?:的)?(?:体测|人体成分)/)||[])[1];
  if(!name)throw new Error('请使用“客户名的体测，收录一下”');
  const people=(await User.find({name,isDeleted:{$ne:true},tenantId:staff.tenantId||null}).limit(3)).filter(p=>canAccessPatient(staff,p));
  if(people.length!==1)throw new Error(people.length?'客户同名，需补充手机号':'未找到可访问客户');
  const source=material.sourceUrl||('https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token='+encodeURIComponent(await token())+'&media_id='+encodeURIComponent(material.mediaId));
  const r=await fetch(source,{signal:AbortSignal.timeout(20000)}),buf=Buffer.from(await r.arrayBuffer()),mime=fileMime(buf);
  if(!mime||buf.length>20*1024*1024)throw new Error('附件格式或大小不支持');
  const sha=require('crypto').createHash('sha256').update(buf).digest('hex');
  const old=await MedicalReport.findOne({user:people[0]._id,sourceSha256:sha});if(old){material.status='duplicate';material.reportId=old._id;await material.save();return `已存在，未重复收录：${people[0].name}｜身体成分报告`;}
  const stored=await uploadBuffer(buf,mime,'reports');const report=await MedicalReport.create({user:people[0]._id,tenantId:people[0].tenantId||null,title:'身体成分报告',type:'body_comp',documentCategory:'body_composition',fileUrl:stored.url,fileUrls:[stored.url],ossKey:stored.key,ossKeys:[stored.key],mimeType:mime,fileSize:String(stored.size),sourceSha256:sha,uploadedBy:staff._id,uploadedByRole:staff.role,audit_status:'unaudited',aiStatus:'none'});
  material.status='archived';material.reportId=report._id;await material.save();return `已收录：${people[0].name}｜身体成分报告｜待人工审核`;
}
router.use((req,res,next)=>process.env.WECOM_APP_CALLBACK_ENABLED==='true'?next():res.sendStatus(503));
router.get('/',(req,res)=>{
  try {
    crypto.verify(req.query,req.query.echostr,process.env.WECOM_APP_CALLBACK_TOKEN);
    res.type('text').send(crypto.decrypt(req.query.echostr,process.env.WECOM_APP_CALLBACK_AES_KEY,process.env.WECOM_CORP_ID));
  } catch {res.sendStatus(403);}
});
router.post('/',express.text({type:['text/xml','application/xml'],limit:'100kb'}),async(req,res)=>{
  let xml;
  try {
    const encrypted=crypto.field(req.body,'Encrypt');
    crypto.verify(req.query,encrypted,process.env.WECOM_APP_CALLBACK_TOKEN);
    xml=crypto.decrypt(encrypted,process.env.WECOM_APP_CALLBACK_AES_KEY,process.env.WECOM_CORP_ID);
    if(crypto.field(xml,'ToUserName')!==process.env.WECOM_CORP_ID || crypto.field(xml,'AgentID')!==process.env.WECOM_AGENT_ID) throw new Error('Wrong app');
  } catch {return res.sendStatus(403);}
  try {
    const from=crypto.field(xml,'FromUserName'), type=crypto.field(xml,'MsgType');
    if(type==='event')return res.type('text').send('success');
    let reply='当前仅支持文字指令。报告请在家庭助手中选择具体成员后上传。';
    if(type==='image'||type==='file') {
      const link=await Link.findOne({corpId:process.env.WECOM_CORP_ID,userId:from});const staff=link&&await require('../models/Admin').findById(link.staffId);
      if(!staff||staff.staffStatus!=='active')reply='请先绑定有效的嘉医汇员工账号。';
      else {const id=crypto.field(xml,'MsgId'),mediaId=optional(xml,'MediaId'),sourceUrl=type==='image'?optional(xml,'PicUrl'):'';if(!mediaId&&!sourceUrl)reply='未取得附件地址，请重新发送原文件。';else {await Material.updateOne({messageId:process.env.WECOM_CORP_ID+':'+id},{$setOnInsert:{staffId:staff._id,tenantId:staff.tenantId||null,messageId:process.env.WECOM_CORP_ID+':'+id,mediaId,sourceUrl,fileName:optional(xml,'FileName'),expiresAt:new Date(Date.now()+10*60*1000)}},{upsert:true});reply='附件已收到。请在10分钟内发送“客户名的体测，收录一下”。';}}
    } else if(type==='text') {
      const content=crypto.field(xml,'Content');
      const pair=/^绑定嘉医汇 ([a-f0-9]{32})$/.exec(content.trim());
      if(pair) {
        const hash=createHash('sha256').update(pair[1]).digest('hex');
        const linked=await Link.findOneAndUpdate({corpId:process.env.WECOM_CORP_ID,pairHash:hash,pairExpires:{$gt:new Date()},userId:{$exists:false}},{$set:{userId:from},$unset:{pairHash:1,pairExpires:1}},{new:true});
        reply=linked?'员工账号已绑定。文字指令会进入家庭助手的应用收件箱，由您选择客户并确认。':'绑定码无效、已使用或账号已绑定，请回到系统核对。';
      } else {
        const link=await Link.findOne({corpId:process.env.WECOM_CORP_ID,userId:from});
        const staff=link && await require('../models/Admin').findById(link.staffId).lean();
        const allowed=staff && staff.staffStatus==='active' && !staff.mustChangePassword && String(staff.tenantId || '')===String(link.tenantId || '') && ['superadmin','familyDoctor','nutritionist','healthManager','medicalAssistant','psychologist','rehabSpecialist','tcmDoctor','specialist','healthPlanner'].includes(staff.role);
        if(!allowed)reply='请先登录嘉医汇，在家庭助手的应用收件箱核对员工账号绑定和权限。';
        else if(content.length>6000)reply='内容过长，请缩短到6000字以内。';
        else {
          const pending=await Material.findOne({staffId:staff._id,status:'received',createdAt:{$gt:new Date(Date.now()-10*60*1000)}}).sort({createdAt:-1});
          if(pending&&/(收录|入库|归档)/.test(content)){try{reply=await archive(pending,staff,content);}catch(e){pending.status='needs_match';pending.instruction=content.slice(0,200);pending.error=e.message;await pending.save();reply='未自动入库：'+e.message+'。已交给小瑞处理。';}}
          else reply='请先发送报告图片或PDF，再发送“客户名的体测，收录一下”。';
        }
      }
    }
    const cdata=s=>String(s).replace(/\]\]>/g,']]]]><![CDATA[>');
    const plain=`<xml><ToUserName><![CDATA[${cdata(from)}]]></ToUserName><FromUserName><![CDATA[${process.env.WECOM_CORP_ID}]]></FromUserName><CreateTime>${Math.floor(Date.now()/1000)}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${reply}]]></Content></xml>`;
    const encrypted=crypto.encrypt(plain,process.env.WECOM_APP_CALLBACK_AES_KEY,process.env.WECOM_CORP_ID), timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(12).toString('hex');
    res.type('application/xml').send(`<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt><MsgSignature><![CDATA[${crypto.signature(process.env.WECOM_APP_CALLBACK_TOKEN,timestamp,nonce,encrypted)}]]></MsgSignature><TimeStamp>${timestamp}</TimeStamp><Nonce><![CDATA[${nonce}]]></Nonce></xml>`);
  } catch (error) {console.error('[wecom-app] callback failed', {message:error.message});res.sendStatus(503);}
});
module.exports=router;
