// Personal-data database stage. Not an account-deletion endpoint: an orchestrator must
// first persist an exhaustive file/retention manifest and fence all writers. This module
// intentionally cannot delete User or mark a request completed.
const OWNED = Object.freeze({
  user: ['AiCaseReview','AiDataConsent','AppointmentReminder','ChatConversationState','ChatLog','CheckupPlan',
    'DailyTeamInsight','QuestionnaireResponse','Feedback','HealthRecord','MedicalReport','Medication','Message',
    'PointsLog','PushDevice','Reminder','ScreeningYearSummary','ServiceInquiry','ServiceProposal','ShareToken',
    'Supplement','Task','UserScreeningItem','WecomKfContact','WecomKfMessage','LoginSession'],
  patientId: ['AbnormalReview','AIHealthCheckupReview','AnnualManagementDecision','AnnualPlan','AnnualPlanPreparation',
    'AnnualReportProblemReview','AnnualServicePeriod','AnnualServiceRecommendation','CareFlow','ChatFollowupJob',
    'CheckupPreparationHandoff','ExamRequisition','FollowUp','FollowUpDeletionLog','FollowUpServiceLink','HealthPlan',
    'HealthRiskEvent','MdtPacket','MedicalReportDeletionLog','MonthlyServiceReview','NutritionAssessmentRequest',
    'NutritionInterventionDraft','PhaseAssessment','PhaseAssessmentGeneration','PlanDeletionLog',
    'ProfessionalHealthAssessment','PsychAssessment','PushRecord','RecurringSupplyPlan','Referral','ReportFollowUpDraft',
    'ResearchCandidate','ResearchCareJourney','ServiceGroupEntry','ServiceGroupReceipt','ServiceRecord',
    'ServiceSupervisionRequest','WeightProgressPhoto'],
  userId: ['UserChangeLog'],
  _id: ['MetabolicPilot'],
});
// ShareToken uses userId, not user. Never derive ownership from submittedBy/payerUser.
const RULES = Object.entries(OWNED).flatMap(([path, names]) => names.map(name => ({ name, path: name === 'ShareToken' ? 'userId' : path })));
function fail(message) { throw Object.assign(new Error(message), { code: 'DELETION_PREFLIGHT_FAILED' }); }
function buildOperations(models, subject) {
  if (!subject?.userId?.toHexString || !subject?.tenantId?.toHexString) fail('ObjectId account and institution required');
  const operations = [];
  const queryFor = (name, condition) => {
    const Model = models[name];
    if (!Model) fail(`Missing reviewed model: ${name}`);
    return Model.schema.path('tenantId') ? { ...condition, tenantId: subject.tenantId } : condition;
  };
  const erase = (name, condition) => operations.push({ name, filter: queryFor(name, condition), action: 'delete' });
  const change = (name, condition, update) => operations.push({ name, filter: queryFor(name, condition), action: 'update', update });
  for (const { name, path } of RULES) {
    if (!models[name]?.schema.path(path)) fail(`Ownership path changed: ${name}.${path}`);
    erase(name, { [path]: subject.userId });
  }
  // This model exists only in the isolated review service. Remove the deleted
  // account's actual credentials, without assuming a production review login.
  if (models.ReviewCredential) {
    if (!models.ReviewCredential.schema.path('user')) fail('Review credential ownership changed');
    erase('ReviewCredential', {user: subject.userId});
  }
  // Relations are removed, but children, adult relatives and the shared group stay intact.
  erase('ChildGuardianLink', { $or: [{ child: subject.userId }, { guardian: subject.userId }] });
  change('User', { 'familyLinks.linkedUser': subject.userId }, { $pull: { familyLinks: { linkedUser: subject.userId } } });
  change('User', { 'familyInvites.fromUser': subject.userId }, { $pull: { familyInvites: { fromUser: subject.userId } } });
  for (const field of ['invitedBy', 'pendingInviter']) change('User', { [field]: subject.userId }, { $unset: { [field]: '' } });
  change('ServiceGroup', { 'members.patientId': subject.userId }, { $pull: { members: { patientId: subject.userId } } });
  change('ServiceGroup', { 'senderBindings.patientId': subject.userId }, { $pull: { senderBindings: { patientId: subject.userId } } });
  for (const field of ['targetUsers', 'respondedUsers']) change('DynamicQuestionnaire', { [field]: subject.userId }, { $pull: { [field]: subject.userId } });
  // Keep records owned by another family member; only remove this account's submitter pointer.
  for (const [name, field] of [['MedicalReport','submittedByUser'],['MedicalReport','uploadConsent.accountId'],
    ['QuestionnaireResponse','submittedBy'],['ServiceInquiry','requestedByUser'],['Message','audioTranscriptionRequestedBy']]) {
    change(name, { user: { $ne: subject.userId }, [field]: subject.userId }, { $unset: { [field]: '' } });
  }
  return operations;
}
async function inspectPersonalData({ models, subject }) {
  const operations = buildOperations(models, subject);
  const result = [];
  // Native collection includes soft-deleted records hidden by model query middleware.
  for (const operation of operations) result.push({ ...operation, count: await models[operation.name].collection.countDocuments(operation.filter) });
  return result;
}
async function erasePersonalData({ models, subject, assertReady }) {
  if (typeof assertReady !== 'function') fail('Verified writer freeze, file and financial preflight required');
  const operations = buildOperations(models, subject);
  const results = [];
  for (const operation of operations) {
    // Never replace this with a constant callback in a production adapter. It must verify
    // the active worker fence and persisted file/retention plan before EACH mutation.
    if (await assertReady(subject) !== true) fail('Deletion prerequisites no longer satisfied');
    const collection = models[operation.name].collection;
    const result = operation.action === 'delete' ? await collection.deleteMany(operation.filter)
      : await collection.updateMany(operation.filter, operation.update);
    results.push({ model: operation.name, action: operation.action,
      affected: operation.action === 'delete' ? result.deletedCount : result.modifiedCount });
  }
  if (await assertReady(subject) !== true) fail('Deletion writer fence lost');
  const remaining = await inspectPersonalData({ models, subject });
  if (remaining.some(row => row.count)) fail('Personal data changed or cleanup is incomplete');
  return { stage: 'personal-database', verifiedAt: new Date(), results };
}
module.exports = { RULES, buildOperations, inspectPersonalData, erasePersonalData };
