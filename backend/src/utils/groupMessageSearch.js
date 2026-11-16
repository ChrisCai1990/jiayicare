function fail(message) { throw Object.assign(new Error(message),{status:400}); }
function day(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('日期格式无效');
  const utc=new Date(value+'T00:00:00Z');
  if (!Number.isFinite(+utc) || utc.toISOString().slice(0,10)!==value) fail('日期无效');
  return new Date(+utc-8*3600000);
}
function searchFilter(query={}) {
  const filter={};
  const q=String(query.q || '').trim();
  if(q.length>80)fail('关键词请控制在80字以内');
  if(q)filter.content={$regex:q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'};
  const start=query.start?day(String(query.start)):null,end=query.end?day(String(query.end)):null;
  if(start&&end&&+start>+end)fail('开始日期不能晚于结束日期');
  if(start||end)filter.createdAt={...(start?{$gte:start}:{}),...(end?{$lt:new Date(+end+86400000)}:{})};
  if(!['all','image','file','text'].includes(query.kind || 'all'))fail('消息类型无效');
  if(query.kind==='text')filter.materialReportId={$exists:false};
  return filter;
}
module.exports={searchFilter};
