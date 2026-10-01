// Same forward jump semantics as the client questionnaire; unanswered questions remain visible.
function visibleQuestions(questions,answers,gender) {
 const list=(questions||[]).filter(q=>!q.genderOnly||q.genderOnly===gender),result=[];
 for(let i=0;i<list.length;) {
  const q=list[i];result.push(q);const a=answers[q.id],values=Array.isArray(a)?a:a?.values||[a?.value??a];
  const rule=(q.jumpLogic||[]).find(r=>values.includes(r.condition)&&list.findIndex(t=>t.id===r.jumpTo)>i);
  i=rule?list.findIndex(t=>t.id===rule.jumpTo):i+1;
 }
 return result;
}
module.exports={visibleQuestions};
