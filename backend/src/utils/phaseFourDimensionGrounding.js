const {sections}=require('./reviewFourSections');
const text=x=>String(x||'').replace(/\s+/g,' ').trim();
const short=x=>{const s=text(x);return s.length<=440?s:s.slice(0,420)+'…（其余见原始资料）';};
const unlabeled=x=>x.replace(/^[^：]+：/,'');
function ground(value,context){
 const out=value.map(x=>[...x]);const records=context.recentHealthRecords||[],reports=context.periodReports||[],followups=context.periodFollowups||[];
 // Measurements remain source facts: do not replace them with thresholds or comparisons from old summaries.
 const facts=sections({records,reports,followups});out[0]=facts[0].map(x=>short(unlabeled(x)));
 const types=[['diet'],['exercise'],['sleep'],['smoking','smoke','alcohol','tobacco'],['mood','emotion']];
 // The model can say "no records" even when the supplied evidence contains them.
 // Ground every lifestyle dimension in the same period records, in both directions.
 types.forEach((names,i)=>{out[1][i]=short(unlabeled(facts[1][i]));});
 const diet=records.filter(r=>r.type==='diet');
 if(diet.length&&diet.filter(r=>!text(r.value).replace(/【[^】]+】/g,'').trim()).length/diet.length>=0.8)out[1][0]='本期饮食文字记录多数仅标注餐次，不能仅据这些文字判断膳食结构或行为改变；如有图片，由营养师结合原记录核对。不适相关文字已纳入阶段变化。';
 const lifeRecords=records.some(r=>types.flat().includes(r.type));
 const lifeEvidence=followups.filter(r=>!r.isBlocked&&/饮食|运动|睡眠|烟酒|情绪|生活方式/.test((r.theme||'')+' '+(r.plannedContent||''))&&(r.executedContent||r.cancelReason));
 if(!lifeEvidence.length){
  out[2][0]=lifeRecords?'本期已有部分生活方式记录，但缺少行为目标与执行结果的逐项核对、客户障碍反馈，尚不能确认哪些行为改变未落实及其原因。':'本期暂无足够生活方式目标与执行对照记录，无法判断行为改变及未落实原因；无记录不等于没有执行。';
  out[3][0]=lifeRecords?'由营养师在既有随访中结合方案与本期记录核对优先行为目标；确认未落实及实际障碍后再调整做法，复核时间待确认。':'本期尚无已明确的未落实问题需要新增措施，按既有已确认计划继续跟进，不因缺记录新增打卡或签署任务。';
 }else{
  out[2][0]='已记录执行反馈：'+short(lifeEvidence.map(r=>text(r.executedContent||r.cancelReason)).join('；'))+'。须与本期目标核对，未明确的行为障碍及原因待核实。';
  out[3][0]='由营养师围绕上述反馈核对行为目标与实际障碍，针对确认未落实的部分调整做法；责任人和复核时间待确认。';
 }
 const medical=followups.filter(r=>!r.isBlocked&&/就医|检查|复查|门诊|接种|医务代办|医疗代诊|配药|陪诊/.test((r.theme||'')+' '+(r.plannedContent||''))&&!/审核.*报告|报告.*审核|解读报告|报告解读/.test(r.theme||''));
 const active=medical.filter(r=>['planned','in_progress','missed'].includes(r.status));
 const duplicate=medical.filter(r=>r.status==='cancelled'&&/重复/.test(r.cancelReason||''));
 const completed=medical.filter(r=>r.status==='completed');
 const names=active.slice(0,2).map(r=>text(r.theme||r.plannedContent).slice(0,55)).join('、');
 const asOf=context.capturedAt?new Date(context.capturedAt):new Date();
 const asOfDay=new Date(asOf.getTime()+8*3600000).toISOString().slice(0,10);
 const overdue=active.filter(r=>r.date&&new Date(new Date(r.date).getTime()+8*3600000).toISOString().slice(0,10)<asOfDay);
 if(!medical.length){out[2][1]='本期暂无明确的就医检查计划与执行对照记录，无法判断是否按期完成；无记录不代表未就医。';out[3][1]='本期尚未识别明确的就医检查执行问题，继续既有已确认安排，不凭旧检查结果新增医疗任务。';}
 else if(!active.length){out[2][1]=short((completed.length?'本期相关工作人员任务已办结；本次客户是否完成就医或检查，须另看实际资料与结论，不能从任务状态推断。':'本期无有效待办；已取消轮次保留原因，不能当作工作人员逾期。')+(duplicate.length?'存在重复发起后取消的任务，不应归因为客户放弃。':''));out[3][1]='核对已归档结果；如仍需跟进，以新的有效计划和日期安排，不重新将已完结轮次计为逾期。';}
 else {out[2][1]=short((completed.length?'已有上一轮办结记录；':'')+`当前有效待办：${names}。`+(overdue.length?`其中 ${overdue.length} 条当前任务计划日期已过，属于工作人员待办逾期；客户是否完成医疗行为仍须核对资料。`:'当前任务未超过计划日期，不能视作工作人员逾期。')+(duplicate.length?'重复发起后取消的任务不计逾期。':''));
 out[3][1]=overdue.length?short(`由责任岗位优先处理当前逾期待办${names}，记录联系及安排结果；客户实际就医或检查情况以资料核对。`):short(`按当前有效计划跟进${names}；本次未做的原因和下次安排依据实际反馈记录，不将上一轮已办结任务重新标为逾期。`);}
 if(out[3].length>2)out[3][2]=diet.length?'营养师在下次随访核对膳食记录及体测安排。':'本期暂无明确的营养跟进依据。';
 return out;
}
module.exports={ground};
