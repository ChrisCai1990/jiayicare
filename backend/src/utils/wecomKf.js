const {chat}=require('./ai');
const Contact=require('../models/WecomKfContact');
const Message=require('../models/WecomKfMessage');
const ChatLog=require('../models/ChatLog');
const Cursor=require('../models/WecomKfCursor');
const FollowUp=require('../models/FollowUp');
const {buildWecomKfContext}=require('./wecomKfContext');

const HANDOFF=/(胸痛|呼吸困难|意识不清|昏迷|自杀|自伤|急诊|120|出血|发热|疼痛|头晕|呕吐|腹泻|便血|黑便|停药|换药|剂量|处方|诊断|化验|检查单|报告|孕|哺乳|儿童|过敏)/i;
const UNBOUND='您好，这里是嘉医汇小嘉。您可以咨询服务流程、预约和小程序使用；如需结合个人健康档案提供服务，请先在嘉医汇小程序完成登录并由工作人员确认绑定。涉及症状、用药、检查报告等问题，我会为您转接人工。';
const HANDOFF_REPLY='您提到的内容需要由营养师或医生结合实际情况确认，我不能在这里作诊疗、用药或报告判断。已为您转人工，请稍候；如情况紧急，请立即拨打120或前往急诊。';
const IMAGE_REPLY='图片已收到。为了避免仅凭图片作出不可靠判断，请补充餐食名称、大致份量、饮品或加餐；营养师会结合您的服务情况进一步反馈。';
const SYSTEM='你是嘉医汇“小嘉”健康服务助手。仅回答服务流程、预约、复查准备和一般性饮食记录整理；使用中文，200字以内，语气温和。不得诊断疾病、解读检查报告、开药、调整用药、制定治疗或个体化检查方案，不得承诺效果。信息不足时只追问一个最关键的问题。遇到症状、用药、检查报告、孕产儿童或紧急情况，明确转人工/正规就医。';

function enabled(){return process.env.WECOM_KF_ENABLED==='true';}
// 复用员工自建应用时，企微只允许该应用配置一个接收消息服务器；客服事件由同一
// URL 解密后分流。授权该应用调用微信客服后，客服 Secret 可配置为该应用 Secret。
function sharedAppCallback(){return process.env.WECOM_KF_USE_APP_CALLBACK==='true';}
function testMode(){return process.env.WECOM_KF_TEST_MODE==='true';}
function allowedAccount(openKfId){
  const ids=String(process.env.WECOM_KF_ALLOWED_ACCOUNT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
  return ids.length?ids.includes(openKfId):!testMode();
}
const TEST_REPLY='测试消息已收到，嘉医汇微信客服自动回复通道已连通。本条为固定测试回复，尚未开启AI问答。';
function needsHandoff(text){
  const factual=/(报告名称|报告日期|报告列表|有哪些报告|过敏记录|过敏史)/.test(text)&&!/(胸痛|呼吸困难|昏迷|自杀|自伤|出血|发热|疼痛|头晕|呕吐|腹泻|便血|黑便|停药|换药|剂量|处方|诊断|治疗|严重|正常|异常|建议|应该|怎么办|能不能|吃什么)/.test(text);
  return HANDOFF.test(text)&&!factual;
}
function configured(){
  const base=Boolean(process.env.WECOM_KF_CORP_ID&&process.env.WECOM_KF_SECRET);
  if(!base)return false;
  if(!sharedAppCallback())return Boolean(process.env.WECOM_KF_TOKEN&&process.env.WECOM_KF_AES_KEY);
  return Boolean(
    process.env.WECOM_APP_CALLBACK_ENABLED==='true'&&
    process.env.WECOM_APP_CALLBACK_TOKEN&&process.env.WECOM_APP_CALLBACK_AES_KEY&&
    process.env.WECOM_CORP_ID===process.env.WECOM_KF_CORP_ID
  );
}
async function accessToken(){
  const qs=new URLSearchParams({corpid:process.env.WECOM_KF_CORP_ID,corpsecret:process.env.WECOM_KF_SECRET});
  const r=await fetch('https://qyapi.weixin.qq.com/cgi-bin/gettoken?'+qs,{signal:AbortSignal.timeout(10000)}),d=await r.json();
  if(!r.ok||!d.access_token)throw new Error('微信客服应用授权失败');
  return d.access_token;
}
async function sendText(token,openKfId,externalUserId,content){
  const r=await fetch('https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg?access_token='+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({touser:externalUserId,open_kfid:openKfId,msgtype:'text',text:{content}}),signal:AbortSignal.timeout(12000)});
  const d=await r.json();if(!r.ok||d.errcode)throw new Error('微信客服发送失败'+(d.errcode?`(${d.errcode})`:''));
}
async function ensureAssistantSession(token,openKfId,externalUserId){
  const request=async(action,extra={})=>{
    const r=await fetch('https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/'+action+'?access_token='+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({open_kfid:openKfId,external_userid:externalUserId,...extra}),signal:AbortSignal.timeout(10000)});
    const d=await r.json();if(!r.ok||d.errcode)throw new Error('微信客服会话状态失败'+(d.errcode?`(${d.errcode})`:''));
    return d;
  };
  const state=await request('get');
  if(state.service_state===1)return true;
  // 已分配给人工、排队和已结束的会话不抢回；跳过消息以免阻塞整个客服游标。
  if(state.service_state!==0)return false;
  await request('trans',{service_state:1});
  return true;
}
async function answer({corpId,openKfId,item,token}){
  if(!allowedAccount(openKfId))return;
  const since=Number(process.env.WECOM_KF_REPLY_AFTER||0);
  if(since&&(!Number.isFinite(Number(item?.send_time))||Number(item.send_time)<since))return;
  if(!item?.msgid||item.origin!==3||!item.external_userid)return;
  const insert=await Message.updateOne({corpId,msgId:item.msgid},{$setOnInsert:{corpId,msgId:item.msgid,openKfId,externalUserId:item.external_userid,messageType:item.msgtype||'',direction:'customer',expiresAt:new Date(Date.now()+30*24*3600*1000)}},{upsert:true});
  const existing=await Message.findOne({corpId,msgId:item.msgid});
  // 已完成的消息不重复发送；失败消息随未推进的游标重试。
  if(!insert.upsertedCount&&existing?.status!=='failed')return;
  let content=UNBOUND,replyKind='unbound_notice',status='replied',aiLog=null;
  try{
    if(!await ensureAssistantSession(token,openKfId,item.external_userid)){
      await Message.updateOne({corpId,msgId:item.msgid},{$set:{status:'ignored',errorCode:'session_not_assistant'}});
      return;
    }
    if(testMode()){content=TEST_REPLY;replyKind='safe_notice';}
    else if(item.msgtype!=='text') {content=IMAGE_REPLY;replyKind='image_notice';}
    else if(needsHandoff(String(item.text?.content||''))){
      content=HANDOFF_REPLY;replyKind='safe_notice';status='handoff';
      const contact=await Contact.findOne({corpId,externalUserId:item.external_userid,active:true,consentAt:{$ne:null}})
        .populate('user','isDeleted assignedNutritionist assignedHealthManager assignedHealthPlanner');
      const owner=contact?.user&&(contact.user.assignedNutritionist||contact.user.assignedHealthManager||contact.user.assignedHealthPlanner);
      if(contact?.user&&!contact.user.isDeleted){
        await Message.updateOne({corpId,msgId:item.msgid},{$set:{user:contact.user._id}});
        if(owner&&!existing?.followUp){
          const followUp=await FollowUp.create({
            staffId:owner,assignedTo:owner,patientId:contact.user._id,type:'wechat',status:'planned',
            theme:'微信客服待人工接管',
            plannedContent:'微信客服高风险内容，请在企业微信客服后台接管并处理。',
            content:'来源：微信客服高风险自动分流。待办不包含客户原文。',
            tags:['微信客服','需人工接管'],
          });
          await Message.updateOne({corpId,msgId:item.msgid},{$set:{followUp:followUp._id}});
        }
      }
    }
    else {
      const contact=await Contact.findOne({corpId,externalUserId:item.external_userid,active:true,consentAt:{$ne:null}}).populate('user','name preferredTitle isDeleted');
      if(contact?.user&&!contact.user.isDeleted&&process.env.WECOM_KF_AI_ENABLED==='true'){
        const context=await buildWecomKfContext(contact.user._id,String(item.text?.content||''));
        content=await chat(context.messages,{systemPrompt:context.systemPrompt,maxTokens:600,temperature:0.1,timeoutMs:45000});
        // 生成期间若解绑或改绑，禁止将此前取到的个人上下文发送出去。
        if(!await Contact.exists({_id:contact._id,corpId,externalUserId:item.external_userid,user:contact.user._id,active:true,consentAt:{$ne:null}})){
          await Message.updateOne({corpId,msgId:item.msgid},{$set:{status:'ignored',errorCode:'binding_changed'}});return;
        }
        replyKind='ai';
        aiLog={user:contact.user._id,role:'wecom_kf',intent:'knowledge',userMessage:String(item.text?.content||'').slice(0,1200),aiReply:content};
      }
    }
    if(aiLog&&!await ensureAssistantSession(token,openKfId,item.external_userid)){
      await Message.updateOne({corpId,msgId:item.msgid},{$set:{status:'ignored',errorCode:'session_changed_during_generation'}});return;
    }
    await sendText(token,openKfId,item.external_userid,content);
    await Message.updateOne({corpId,msgId:item.msgid},{$set:{status,replyKind,errorCode:''}});
    if(aiLog)await ChatLog.create(aiLog).catch(error=>console.error('[wecom-kf] chat history save failed',error.name));
  }catch(error){
    await Message.updateOne({corpId,msgId:item.msgid},{$set:{status:'failed',errorCode:String(error.message||'failed').slice(0,120)}});
    throw error;
  }
}
async function sync({openKfId,callbackToken}){
  if(!enabled()||!configured()||!openKfId||!callbackToken||!allowedAccount(openKfId))return;
  const token=await accessToken();
  const cursorRecord=await Cursor.findOne({corpId:process.env.WECOM_KF_CORP_ID,openKfId});
  let cursor=cursorRecord?.cursor||'',nextCursor='';
  for(;;){
    const body={open_kfid:openKfId,token:callbackToken,limit:100};
    if(cursor)body.cursor=cursor;
    const r=await fetch('https://qyapi.weixin.qq.com/cgi-bin/kf/sync_msg?access_token='+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const d=await r.json();if(!r.ok||d.errcode)throw new Error('微信客服同步失败'+(d.errcode?`(${d.errcode})`:''));
    for(const item of d.msg_list||[])await answer({corpId:process.env.WECOM_KF_CORP_ID,openKfId,item,token});
    nextCursor=d.next_cursor||nextCursor;
    if(!d.has_more||!d.next_cursor)break;
    cursor=d.next_cursor;
  }
  // 只有整批处理成功才提交游标；中途失败则由平台重投，本地 msgId 幂等保护重复发送。
  if(nextCursor)await Cursor.findOneAndUpdate({corpId:process.env.WECOM_KF_CORP_ID,openKfId},{$set:{cursor:nextCursor}},{upsert:true,new:true});
}
module.exports={enabled,configured,sharedAppCallback,sync,answer,ensureAssistantSession,needsHandoff,UNBOUND,HANDOFF_REPLY,IMAGE_REPLY,TEST_REPLY};
