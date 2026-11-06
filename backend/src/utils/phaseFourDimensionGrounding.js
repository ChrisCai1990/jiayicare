const {sections}=require('./reviewFourSections');
const text=x=>String(x||'').replace(/\s+/g,' ').trim();
const short=x=>{const s=text(x);return s.length<=440?s:s.slice(0,420)+'…（其余见原始资料）';};
const unlabeled=x=>x.replace(/^[^：]+：/,'');
function ground(value,context){
 const out=value.map(x=>[...x]);const records=context.recentHealthRecords||[],reports=context.periodReports||[],followups=context.periodFollowups||[];
 // Measurements remain source facts: do not replace them with thresholds or comparisons from old summaries.
 const facts=sections({records,reports,followups});out[0]=facts[0].map(x=>short(unlabeled(x)));
 const types=[['diet'],['exercise'],['sleep'],['smoking','smoke','alcohol','tobacco'],['mood','emotion']];
 types.forEach((names,i)=>{if(!records.some(r=>names.includes(r.type)))out[1][i]='本期暂无记录。';});
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
 const pending=medical.filter(r=>r.status!=='completed');
 const duplicate=pending.filter(r=>/重复/.test(r.cancelReason||''));
 const actual=pending.filter(r=>!duplicate.includes(r));
 const names=actual.slice(0,2).map(r=>text(r.theme||r.plannedContent).slice(0,55)).join('、');
 if(!medical.length){out[2][1]='本期暂无明确的就医检查计划与执行对照记录，无法判断是否按期完成；无记录不代表未就医。';out[3][1]='本期尚未识别明确的就医检查执行问题，继续既有已确认安排，不凭旧检查结果新增医疗任务。';}
 else if(!pending.length){out[2][1]='本期相关任务已标记完成；是否及时仍需与实际完成凭据和约定期限核对，不能把服务任务完成直接等同于客户已就医。';out[3][1]='结合既有服务记录核对实际完成时间与约定安排；如无延误，不新增补办任务。';}
 else {out[2][1]=short((names?'待核实事项：'+names+'。系统状态尚未闭环，须核对实际完成情况及约定期限，不能仅凭状态认定逾期。':'')+(duplicate.length?'存在重复发起后取消的任务，不应归因为客户放弃。':'')+(actual.some(r=>r.cancelReason)?'已记录取消原因：'+actual.filter(r=>r.cancelReason).slice(0,2).map(r=>text(r.cancelReason)).join('；')+'。':'')+(actual.length?'未及时完成的实际原因尚待核实。':''));
 out[3][1]=actual.length?short('由营养健康团队核对'+names+'的实际完成凭据、约定时间及客户反馈；确认未按期完成后，针对实际障碍协调安排，责任人、完成及复核日期待确认。'):'核对重复任务是否已正确关闭，保留对应的有效安排；不将重复取消列为客户未完成事项。';}
 return out;
}
module.exports={ground};
