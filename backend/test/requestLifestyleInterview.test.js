const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { fingerprint } = require('../src/utils/lifestyleInterview');

test('单次营养需求沿用膳食生活方式访谈，暂存后由责任营养师写入档案并完成需求', async t => {
  const Request = require('../src/models/NutritionAssessmentRequest');
  const User = require('../src/models/User');
  const { DynamicQuestionnaire, QuestionnaireResponse } = require('../src/models/DynamicQuestionnaire');
  const id = new mongoose.Types.ObjectId().toString();
  const template = { _id: '6a49eab9fc1595013da70645', title: '膳食调查问卷', updatedAt: new Date('2026-10-01'),
    questions: [{ id: 'breakfast', type: 'text', text: '早餐时间', archiveField: 'lifestyle_data.breakfastTime' }] };
  let task = { _id: id, tenantId: 'tenant', patientId: 'patient', nutritionistId: 'nutritionist',
    status: 'booked', reason: '核实膳食习惯', updatedAt: new Date('2026-10-30T00:00:00Z'), formData: {}, events: [] };
  let user = { _id: 'patient', tenantId: 'tenant', assignedNutritionist: 'nutritionist',
    lifestyle_data: {}, lifestyleHistory: [] };
  const chain = value => ({ lean: async () => structuredClone(value), sort() { return this } });
  const set = (object, path, value) => {
    const parts = path.split('.'); let current = object;
    for (const part of parts.slice(0, -1)) current = current[part] ??= {};
    current[parts.at(-1)] = value;
  };
  const apply = (object, update) => {
    for (const [key, value] of Object.entries(update.$set || {})) set(object, key, value);
    for (const [key, value] of Object.entries(update.$push || {})) {
      const parts = key.split('.'); let current = object;
      for (const part of parts) current = current?.[part];
      set(object, key, [...(current || []), value]);
    }
  };
  t.mock.method(Request, 'findOne', () => chain(task));
  t.mock.method(Request, 'findOneAndUpdate', (_filter, update) => {
    apply(task, update); task.updatedAt = new Date(+task.updatedAt + 1); return chain(task);
  });
  t.mock.method(User, 'findOne', () => chain(user));
  let archiveWrites = 0;
  t.mock.method(User, 'updateOne', async (_filter, update) => {
    archiveWrites += 1; apply(user, update); return { matchedCount: 1 };
  });
  t.mock.method(DynamicQuestionnaire, 'findById', () => chain(template));
  t.mock.method(QuestionnaireResponse, 'findOne', () => chain(null));
  let responseWrites = 0, interrupt = true;
  t.mock.method(QuestionnaireResponse, 'updateOne', async () => {
    if (interrupt) throw new Error('interrupted');
    responseWrites += 1; return {};
  });
  const { handle } = require('../src/utils/requestLifestyleInterview');
  const invoke = async (role, action, body = {}) => {
    let code = 200, output;
    const res = { status(value) { code = value; return this }, json(value) { output = value; return this } };
    await handle({ method: action ? 'POST' : 'GET', params: { id },
      staff: { _id: role === 'nutritionist' ? 'nutritionist' : 'other', role, tenantId: 'tenant', name: '营养师' },
      body }, res);
    return { code, output };
  };
  assert.equal((await invoke('familyDoctor', 'submit', {})).code, 403);
  const context = await invoke('nutritionist');
  assert.equal(context.code, 200);
  assert.equal(context.output.data.template.title, '膳食调查问卷');
  const payload = { answers: { breakfast: '08:00' }, confirmed: ['breakfast'],
    method: '电话访谈', notes: '早餐时间较晚，建议逐步调整', patientVersion: fingerprint(user),
    templateVersion: template.updatedAt.toISOString(), baseUpdatedAt: task.updatedAt.toISOString(), confirmConflicts: true };
  assert.equal((await invoke('nutritionist', 'draft', { ...payload, action: 'draft' })).code, 200);
  assert.equal(task.status, 'booked');
  assert.equal(task.formData.lifestyleInterview.phase, 'draft');
  const firstSubmit = await invoke('nutritionist', 'submit', { ...payload, action: 'submit', baseUpdatedAt: task.updatedAt.toISOString() });
  assert.equal(firstSubmit.code, 500);
  assert.equal(task.formData.lifestyleInterview.phase, 'applying');
  interrupt = false;
  const completed = await invoke('nutritionist', 'submit', { action: 'submit' });
  assert.equal(completed.code, 200);
  assert.equal(task.status, 'completed');
  assert.equal(task.formData.lifestyleInterview.phase, 'submitted');
  assert.equal(task.assessment.details.lifestyleInterview.verified.breakfast, '08:00');
  assert.equal(user.lifestyleHistory.length, 1);
  assert.equal(user.lifestyle_data.breakfastTime, '08:00');
  assert.equal(archiveWrites, 1);
  assert.equal(responseWrites, 1);
});
