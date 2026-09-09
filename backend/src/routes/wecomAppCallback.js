const router=require('express').Router();
const express=require('express');
const {createHash,randomBytes}=require('crypto');
const crypto=require('../utils/wecomAppCrypto');
const Link=require('../models/WecomAppLink');
const Inbox=require('../models/WecomAppInbox');
const {seal}=require('../utils/wecomAppInboxCrypto');
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
    if(type==='text') {
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
          const messageId=crypto.field(xml,'MsgId');
          await Inbox.updateOne({messageId:process.env.WECOM_CORP_ID+':'+messageId},{$setOnInsert:{staffId:link.staffId,tenantId:link.tenantId,payload:seal(content),expiresAt:new Date(Date.now()+7*86400000)}},{upsert:true});
          reply='已进入您的应用收件箱（保留7天）。请打开家庭助手选择对应家庭和成员，核对后生成草稿；尚未写入档案或发给客户。';
        }
      }
    }
    const cdata=s=>String(s).replace(/\]\]>/g,']]]]><![CDATA[>');
    const plain=`<xml><ToUserName><![CDATA[${cdata(from)}]]></ToUserName><FromUserName><![CDATA[${process.env.WECOM_CORP_ID}]]></FromUserName><CreateTime>${Math.floor(Date.now()/1000)}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${reply}]]></Content></xml>`;
    const encrypted=crypto.encrypt(plain,process.env.WECOM_APP_CALLBACK_AES_KEY,process.env.WECOM_CORP_ID), timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(12).toString('hex');
    res.type('application/xml').send(`<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt><MsgSignature><![CDATA[${crypto.signature(process.env.WECOM_APP_CALLBACK_TOKEN,timestamp,nonce,encrypted)}]]></MsgSignature><TimeStamp>${timestamp}</TimeStamp><Nonce><![CDATA[${nonce}]]></Nonce></xml>`);
  } catch {res.sendStatus(503);}
});
module.exports=router;
