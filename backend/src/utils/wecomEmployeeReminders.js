const {canAccessGroup,canAccessPatient,same}=require('./serviceGroupRules');
const {workbench}=require('./serviceGroupWorkbench');
let running=false;
async function tick(now=new Date()) {
  if(running || process.env.WECOM_EMPLOYEE_REMINDERS_ENABLED!=='true')return;
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(now));
  if(hour<9 || hour>=18)return;
  running=true;
  try {
    const Link=require('../models/WecomAppLink'), Admin=require('../models/Admin'), Group=require('../models/ServiceGroup'), User=require('../models/User'), Entry=require('../models/ServiceGroupEntry'), FollowUp=require('../models/FollowUp'), Role=require('../models/StaffRole'), Delivery=require('../models/WecomReminderDelivery');
    const links=await Link.find({corpId:process.env.WECOM_CORP_ID,remindersEnabled:true,userId:{$type:'string'}}).limit(200).lean();
    for(const link of links) {
      const staff=await Admin.findById(link.staffId).select('-password').lean();
      if(!staff || staff.staffStatus!=='active' || staff.mustChangePassword || !same(staff.tenantId,link.tenantId))continue;
      if(!['superadmin','familyDoctor','nutritionist','healthManager','medicalAssistant','psychologist','rehabSpecialist','tcmDoctor','specialist','healthPlanner'].includes(staff.role))continue;
      if(staff.role!=='superadmin' && staff.customRoleId) {
        const role=await Role.findById(staff.customRoleId).lean();
        if(!['patients','service_records','followups'].every(k=>role?.permissions?.[k]?.view))continue;
      }
      const groups=await Group.find({tenantId:link.tenantId}).limit(100).lean();
      let count=0;
      for(const g of groups) {
        if(!canAccessGroup(staff,g))continue;
        const patients=await User.find({_id:{$in:g.members.map(m=>m.patientId)}}).lean();
        if(patients.length!==g.members.length || !patients.every(p=>canAccessPatient(staff,p)))continue;
        const entries=await Entry.find({groupId:g._id,kind:'task'}).sort({createdAt:-1}).limit(200).lean();
        const native=await FollowUp.find({_id:{$in:entries.filter(e=>e.nativeId).map(e=>e.nativeId)}}).lean();
        for(const e of entries){const f=native.find(f=>same(f._id,e.nativeId));if(f){e.status=f.status;e.dueAt=f.date;e.assignedTo=f.assignedTo;}}
        count+=workbench(entries,staff._id,now).reminders.length;
      }
      if(!count)continue;
      const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
      let claim;
      try {claim=await Delivery.create({staffId:staff._id,day,expiresAt:new Date(now.getTime()+30*86400000)});}catch(e){if(e.code===11000)continue;throw e;}
      // Claim before sending. Uncertain outcomes are not retried automatically (avoid duplicate reminders).
      try {
        const tokenResult=await fetch('https://qyapi.weixin.qq.com/cgi-bin/gettoken?'+new URLSearchParams({corpid:process.env.WECOM_CORP_ID,corpsecret:process.env.WECOM_APP_SECRET}),{signal:AbortSignal.timeout(12000)});
        const token=await tokenResult.json();if(!tokenResult.ok || token.errcode || !token.access_token)throw new Error('App auth failed');
        const r=await fetch('https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token='+encodeURIComponent(token.access_token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({touser:link.userId,msgtype:'text',agentid:Number(process.env.WECOM_AGENT_ID),text:{content:'您有临期或逾期服务待办，请登录嘉医汇家庭助手查看“我的临期提醒”。此通知不包含客户资料。'}}),signal:AbortSignal.timeout(12000)});
        const result=await r.json();if(!r.ok || result.errcode || result.invaliduser)throw new Error('Delivery failed');
        claim.status='sent';
      } catch {claim.status='failed';}
      await claim.save();
    }
  } finally {running=false;}
}
function start(){if(process.env.WECOM_EMPLOYEE_REMINDERS_ENABLED!=='true')return;const timer=setInterval(()=>tick().catch(()=>console.error('[wecom-reminder] scan failed')),3600000);timer.unref();}
module.exports={tick,start};
