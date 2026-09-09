const test=require('node:test'), assert=require('node:assert/strict');
test('employee reminders are opt-in, permission checked, once daily and contain no patient data',async(t)=>{
  const names=['WecomAppLink','Admin','ServiceGroup','User','ServiceGroupEntry','FollowUp','WecomReminderDelivery'];
  const models=Object.fromEntries(names.map(n=>[n,require('../src/models/'+n)]));
  const saved=[];const patch=(m,k,v)=>{saved.push([m,k,m[k]]);m[k]=v;};
  const q=data=>({select(){return this;},sort(){return this;},limit(){return this;},lean:async()=>data});
  let active=true,permitted=true,deliveries=0,sends=0;
  patch(models.WecomAppLink,'find',filter=>{assert.equal(filter.remindersEnabled,true);return q([{staffId:'s',tenantId:null,userId:'wecom_s'}]);});
  patch(models.Admin,'findById',()=>q({_id:'s',staffStatus:active?'active':'inactive',role:'healthManager',tenantId:null}));
  patch(models.ServiceGroup,'find',()=>q([{_id:'g',tenantId:null,owner:'s',staffIds:['s'],members:[{patientId:'p'}]}]));
  patch(models.User,'find',()=>q([{_id:'p',name:'不得推送的客户',tenantId:null,assignedHealthManager:permitted?'s':'other'}]));
  patch(models.ServiceGroupEntry,'find',()=>q([{_id:'e',kind:'task',status:'planned',assignedTo:'s',dueAt:'2026-09-08',title:'不得推送的医疗内容'}]));
  patch(models.FollowUp,'find',()=>q([]));
  patch(models.WecomReminderDelivery,'create',async()=>{if(deliveries)throw Object.assign(new Error('duplicate'),{code:11000});deliveries++;return {save:async()=>{}};});
  const oldFetch=global.fetch;global.fetch=async(url,options)=>{
    if(url.includes('gettoken'))return {ok:true,json:async()=>({access_token:'synthetic'})};
    const body=JSON.parse(options.body);assert.equal(body.touser,'wecom_s');assert.doesNotMatch(body.text.content,/不得推送/);sends++;
    return {ok:true,json:async()=>({errcode:0})};
  };
  t.after(()=>{for(const [m,k,v]of saved)m[k]=v;global.fetch=oldFetch;delete process.env.WECOM_EMPLOYEE_REMINDERS_ENABLED;});
  const {tick}=require('../src/utils/wecomEmployeeReminders');const now=new Date('2026-09-09T02:00:00Z');
  await tick(now);assert.equal(sends,0);
  process.env.WECOM_EMPLOYEE_REMINDERS_ENABLED='true';
  active=false;await tick(now);assert.equal(sends,0);
  active=true;permitted=false;await tick(now);assert.equal(sends,0);
  permitted=true;await tick(now);assert.equal(sends,1);
  await tick(now);assert.equal(sends,1);
});
