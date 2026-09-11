const express=require('express');
const crypto=require('../utils/wecomAppCrypto');
const {enabled,configured,sharedAppCallback,sync}=require('../utils/wecomKf');
const router=express.Router();
const optional=(xml,name)=>{try{return crypto.field(xml,name);}catch{return '';}};

// 复用员工应用时，客服事件由 /wecom-app 统一接收并分流，避免一个应用配置两个回调地址。
router.use((req,res,next)=>enabled()&&configured()&&!sharedAppCallback()?next():res.sendStatus(503));
router.get('/',(req,res)=>{
  try{crypto.verify(req.query,req.query.echostr,process.env.WECOM_KF_TOKEN);res.type('text').send(crypto.decrypt(req.query.echostr,process.env.WECOM_KF_AES_KEY,process.env.WECOM_KF_CORP_ID));}
  catch(error){res.sendStatus(403);}
});
router.post('/',express.text({type:['text/*','application/xml','*/xml'],limit:'200kb'}),(req,res)=>{
  try{
    const encrypted=optional(String(req.body||''),'Encrypt');crypto.verify(req.query,encrypted,process.env.WECOM_KF_TOKEN);
    const xml=crypto.decrypt(encrypted,process.env.WECOM_KF_AES_KEY,process.env.WECOM_KF_CORP_ID);
    if(optional(xml,'MsgType')!=='event'||optional(xml,'Event')!=='kf_msg_or_event')throw new Error('Unsupported callback');
    const openKfId=optional(xml,'OpenKfId'),callbackToken=optional(xml,'Token');
    if(!openKfId||!callbackToken)throw new Error('Missing customer-service token');
    res.type('text').send('success');
    setImmediate(()=>sync({openKfId,callbackToken}).catch(error=>console.error('[wecom-kf] sync failed',error.message)));
  }catch(error){console.error('[wecom-kf] callback rejected',error.message);res.sendStatus(403);}
});
module.exports=router;
