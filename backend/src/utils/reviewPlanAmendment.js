const { createHash } = require('crypto');
const fields = { medical_treatment: 'department', checkup_completion: 'items', abnormal_followup: 'items', vaccine: 'name' };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const title = row => row.items || row.name || row.department || '';
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\-－—:：()（）]/g, '');
function clean(items) {
  if (!Array.isArray(items) || !items.length || items.length > 30) throw Error('请选择1至30项补充内容');
  return items.map(item => {
    if (!Object.hasOwn(fields, item.key)) throw Error('不支持的方案板块');
    const out = { key:item.key, target:Number.isInteger(item.target) ? item.target : -1 };
    out.datePending = item.datePending === true;
    if (out.target < -1) throw Error('更新事项无效');
    for (const key of ['title','reason','advice','date','timingReason','timeWindow']) {
      out[key] = typeof item[key] === 'string' ? item[key].trim() : '';
      if (out[key].length > (key==='title' ? 200 : 4000)) throw Error('补充内容过长');
    }
    if (!out.title || !out.reason || !out.advice) throw Error('请填写事项、依据和处理建议');
    if (out.datePending) out.date='';
    if (out.date && (!validDate(out.date) || !out.timingReason)) throw Error(`“${out.title}”：请填写有效日期及时间依据，或选择“日期待确认”`);
    return out;
  });
}
function validDate(value) {return /^\d{4}-\d{2}-\d{2}$/.test(value||'') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;}
// AI extraction must reach the editable preview even when it provides only a relative time.
function previewItems(items) {
  if (!Array.isArray(items)) throw Error('补充项格式无效，请重试');
  if (!items.length) return [];
  return clean(items.map(item=>{
    const uncertain=!!item.date && (!validDate(item.date)||!String(item.timingReason||'').trim());
    return {...item,date:uncertain?'':item.date,timeWindow:item.timeWindow||(uncertain?String(item.date):''),datePending:uncertain||item.datePending===true};
  }));
}
function sourceFor(topic,topicId,messageId,scope) {
  if(scope==='topic') {
    const messages=(topic.messages||[]).map(m=>({id:String(m._id),role:m.role,content:m.content,evidence:m.contextSnapshot?.sources||[],createdAt:m.createdAt}));
    if(!messages.some(m=>m.role==='ai')) throw Error('本主题暂无AI回复');
    return {topicId,scope,title:topic.title,messages,conclusion:topic.conclusion?.status==='confirmed'?topic.conclusion:null};
  }
  const message=topic.messages?.find(m=>String(m._id)===messageId&&m.role==='ai');
  if(!message) throw Error('研判回复不存在，请刷新');
  return {topicId,messageId,title:topic.title,content:message.content,evidence:message.contextSnapshot?.sources||[],createdAt:message.createdAt};
}
function apply(base, items, source) {
  const next = JSON.parse(JSON.stringify(base || {})), changes=[];
  for (const item of clean(items)) {
    const module=next[item.key] || {}, rows=[...(module.records || [])];
    const matches=rows.map((r,i)=>normalize(title(r))===normalize(item.title)?i:-1).filter(i=>i>=0);
    if (item.target<0 && matches.length>1) throw Error('存在多个同名事项，请明确选择更新项');
    const index=item.target>=0 ? item.target : matches[0] ?? -1;
    if (index>=rows.length) throw Error('原事项已变化，请重新预览');
    const before=index>=0?rows[index]:null;
    const after={...before,[fields[item.key]]:item.title,reason:`${item.reason}\n处理建议：${item.advice}`,personalizedAdvice:item.advice,
      reviewAmendmentSource:source};
    if (item.date) {after[item.key==='medical_treatment'?'visit_time':'time']=item.date;after.timingReason=item.timingReason;}
    if(item.datePending) {after[item.key==='medical_treatment'?'visit_time':'time']='';after.timingReason=item.timingReason;after.timingStatus='pending_confirmation';}
    else if(item.date) after.timingStatus='confirmed';
    if(item.timeWindow) {after.timeWindow=item.timeWindow;after.reason+=`\n建议时机：${item.timeWindow}`;}
    if (index>=0) rows[index]=after; else rows.push(after);
    next[item.key]={...module,enabled:true,records:rows};
    changes.push({key:item.key,index,before,after});
  }
  return {moduleData:next,changes};
}
module.exports={fields,hash,title,clean,apply,previewItems,sourceFor};
