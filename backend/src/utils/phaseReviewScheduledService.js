// Scheduled continuation may reuse only an authenticated phase-review request,
// while the same clinician remains assigned and active in the same tenant.
async function run(user, generate, dependencies={}) {
 const read=dependencies.read || (id=>require('../models/PhaseAssessment').findOne({patientId:id,'templateSnapshot.aiServiceRequest.kind':'authenticated_phase_preview'}).sort({updatedAt:-1}).select('templateSnapshot.aiServiceRequest').lean());
 const previous=await read(user._id),request=previous?.templateSnapshot?.aiServiceRequest;
 const id=x=>String(x||'');
 if(!request?.actorId||id(request.tenantId)!==id(user.tenantId)||![user.assignedNutritionist,user.assignedFamilyDoctor].some(x=>x&&id(x)===id(request.actorId)))return generate();
 const runJob=dependencies.runJob || require('./aiDataConsent').withReportStaffService;
 return runJob({tenantId:user.tenantId,parseJob:{actorId:request.actorId}},generate);
}
module.exports={run};
