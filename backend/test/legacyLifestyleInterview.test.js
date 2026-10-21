const test = require('node:test');
const assert = require('node:assert/strict');
const {
  reconcileLegacyLifestyleInterviews, cancelReason, duplicateReason, QUESTIONNAIRE_ID,
} = require('../src/utils/legacyLifestyleInterview');

test('review queue replaces empty legacy tasks; same-day completed interview retires duplicate drafts', async () => {
  const completedAt = new Date('2026-10-19T00:18:46Z');
  const tasks = [
    { _id: 'completed', patientId: 'duplicate', sourceType: 'professional_assessment', workflowKey: 'lifestyle_interview', status: 'completed', completedAt },
    { _id: 'duplicate-draft', patientId: 'duplicate', assignedTo: 'nutritionist', sourceType: 'professional_assessment', workflowKey: 'lifestyle_interview', status: 'in_progress', createdAt: new Date('2026-10-19T01:09:28Z'), formData: { lifestyleInterview: { phase: 'draft' } } },
    { _id: 'later-draft', patientId: 'duplicate', assignedTo: 'nutritionist', sourceType: 'professional_assessment', workflowKey: 'lifestyle_interview', status: 'in_progress', createdAt: new Date('2026-10-22T01:09:28Z'), formData: { lifestyleInterview: { phase: 'draft' } } },
    { _id: 'empty-with-survey', patientId: 'surveyed', assignedTo: 'nutritionist', sourceType: 'professional_assessment', workflowKey: 'lifestyle_interview', status: 'planned', createdAt: new Date('2026-10-20T01:00:00Z') },
    { _id: 'empty-without-survey', patientId: 'unanswered', assignedTo: 'nutritionist', sourceType: 'professional_assessment', workflowKey: 'lifestyle_interview', status: 'planned', createdAt: new Date('2026-10-20T01:00:00Z') },
    { _id: 'applying', patientId: 'surveyed', assignedTo: 'nutritionist', sourceType: 'professional_assessment', workflowKey: 'lifestyle_interview', status: 'in_progress', formData: { lifestyleInterview: { phase: 'applying' } } },
    { _id: 'annual', patientId: 'surveyed', assignedTo: 'nutritionist', sourceType: 'professional_assessment', workflowKey: 'annual_nutrition_assessment', status: 'planned' },
    { _id: 'empty-with-old-survey', patientId: 'old-survey', assignedTo: 'nutritionist', sourceType: 'professional_assessment', workflowKey: 'lifestyle_interview', status: 'planned', createdAt: new Date('2026-10-20T01:00:00Z') },
  ];
  const matching = filter => tasks.filter(task =>
    task.sourceType === filter.sourceType &&
    task.workflowKey === filter.workflowKey &&
    (filter.status.$in ? filter.status.$in.includes(task.status) : task.status === filter.status) &&
    (!filter.patientId || (filter.patientId.$in ? filter.patientId.$in.includes(task.patientId) : task.patientId === filter.patientId)) &&
    (!filter.assignedTo || task.assignedTo === filter.assignedTo) &&
    (!filter._id || filter._id.$in.includes(task._id)) &&
    (!filter.completedAt || !!task.completedAt) &&
    (!filter['formData.lifestyleInterview.phase'] ||
      !filter['formData.lifestyleInterview.phase'].$nin.includes(task.formData?.lifestyleInterview?.phase)) &&
    (!filter['formData.lifestyleInterview'] || !task.formData?.lifestyleInterview));
  const models = {
    FollowUp: {
      find(filter) { return { select() { return { lean: async () => matching(filter) }; } }; },
      async updateMany(filter, update) {
        const matched = matching(filter);
        for (const task of matched) {
          task.status = update.$set.status;
          task.cancelReason = update.$set.cancelReason;
        }
        return { modifiedCount: matched.length };
      },
    },
    QuestionnaireResponse: {
      find(filter) {
        assert.equal(filter.questionnaire, QUESTIONNAIRE_ID);
        const responses = [
          { user: 'surveyed', submittedAt: new Date('2026-10-20T02:00:00Z') },
          { user: 'old-survey', submittedAt: new Date('2026-10-19T02:00:00Z') },
        ].filter(response => filter.user.$in.includes(response.user) &&
          response.submittedAt >= filter.submittedAt.$gte);
        return { select() { return { lean: async () => responses }; } };
      },
    },
  };
  assert.equal(await reconcileLegacyLifestyleInterviews(null, 'nutritionist', models), 2);
  assert.equal(tasks[1].status, 'cancelled');
  assert.equal(tasks[1].cancelReason, duplicateReason);
  assert.equal(tasks[2].status, 'in_progress');
  assert.equal(tasks[3].status, 'cancelled');
  assert.equal(tasks[3].cancelReason, cancelReason);
  assert.equal(tasks[4].status, 'planned');
  assert.equal(tasks[5].status, 'in_progress');
  assert.equal(tasks[6].status, 'planned');
  assert.equal(tasks[7].status, 'planned');
  assert.equal(await reconcileLegacyLifestyleInterviews(null, 'nutritionist', models), 0);
});
