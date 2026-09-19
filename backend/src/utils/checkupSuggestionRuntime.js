function models() {
  return Object.fromEntries(['FollowUp', 'AnnualPlan', 'HealthPlan', 'User', 'ProfessionalHealthAssessment', 'MedicalReport', 'Admin', 'StaffRole']
    .map(name => [name, require(`../models/${name}`)]).concat([['Suggestion', require('../models/CheckupPreparationSuggestion')]]));
}
function service(dependencies = models()) {
  return require('./checkupPreparationSuggestion').createSuggestionService(dependencies, (messages, options, { actor, patient }) =>
    require('./aiBudget').withAiContext({ actorId: String(actor._id), tenantId: String(patient.tenantId || ''), business: 'other', stage: 'checkup_preparation_addons' },
      () => require('./ai').chat(messages, options)));
}
module.exports = { models, service };
