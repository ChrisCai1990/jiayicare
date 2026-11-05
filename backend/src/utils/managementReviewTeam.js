const note='健管专员纳入营养健康团队，由营养师统一核对四板块及就医检查执行情况。';
function changes(row){
 if(row.status==='finalized'||!row.roles?.includes('healthManager'))return null;
 const nutrition=row.contributions?.nutritionist;
 const contributions={...row.contributions};
 if(nutrition)contributions.nutritionist={...nutrition,status:nutrition.status==='submitted'?'returned':nutrition.status,returnNote:note};
 const questions={...row.questions};questions.nutritionist=[questions.nutritionist,questions.healthManager].filter(Boolean).join('\n团队执行核对：');delete questions.healthManager;
 return {roles:row.roles.filter(r=>r!=='healthManager'),contributions,questions,status:'collecting',summary:'',summaryDraft:null};
}
async function reconcile(user){
 const Review=require('../models/ManagementReview'),Preparation=require('../models/ManagementReviewPreparation');let count=0;
 const rows=await Review.find({patientId:user._id,status:{$ne:'finalized'},roles:'healthManager'}).lean();
 for(const row of rows){if(row.generation?.status==='running'&&Date.now()-new Date(row.generation.startedAt).getTime()<180000)continue;const set=changes(row);if(!set)continue;
 const result=await Review.updateOne({_id:row._id,__v:row.__v,status:row.status},{$set:set,$inc:{__v:1},$push:{audit:{action:'nutrition_team_merge',at:new Date(),note,snapshot:{roles:row.roles,questions:row.questions,contributions:row.contributions,status:row.status,summary:row.summary}}}});count+=result.modifiedCount;
 }
 const drafts=await Preparation.find({patientId:user._id,'questions.healthManager':{$exists:true}}).lean();
 for(const draft of drafts){if(draft.generation?.status==='running')continue;const questions={...draft.questions,nutritionist:[draft.questions?.nutritionist,draft.questions?.healthManager].filter(Boolean).join('\n团队执行核对：')};delete questions.healthManager;
 await Preparation.updateOne({_id:draft._id,__v:draft.__v},{$set:{questions},$inc:{__v:1},$push:{history:{action:'nutrition_team_merge',at:new Date(),questions:draft.questions}}});}
 return count;
}
module.exports={changes,reconcile};
