const test = require('node:test');
const assert = require('node:assert/strict');
const { policy, enabledForPatient, patientFilter } = require('../src/utils/healthManagementRollout');
const selected = '111111111111111111111111';
const other = '222222222222222222222222';
const env = { NODE_ENV: 'production', HEALTH_MANAGEMENT_ROLLOUT_MODE: 'allowlist', HEALTH_MANAGEMENT_PATIENT_IDS: selected };
test('service recovery intersects caller filters with the allowlist instead of overwriting them', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), sift = require('sift').default;
  const caller = { patientId: other, status: 'waiting' };
  let observed;
  const sandbox = { module: { exports: {} }, console, require: name => {
    if (name === './followUpServiceState') return {};
    if (name === './healthManagementRollout') return { patientFilter: () => patientFilter('patientId', env) };
    if (name === '../models/FollowUpServiceLink') return { find: filter => { observed = filter; return { lean: async () => [] }; } };
    if (name === '../models/Order' || name === '../models/HealthPlan') return {};
    throw Error('unexpected dependency ' + name);
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/followUpServiceLink'), 'utf8'), sandbox);
  assert.equal(await sandbox.module.exports.reconcileServiceLinks(caller), 0);
  assert.equal(sift(observed)({ patientId: other, status: 'waiting' }), false);
  assert.equal(sift(observed)({ patientId: selected, status: 'waiting' }), false);
  assert.deepEqual(caller, { patientId: other, status: 'waiting' });
  await sandbox.module.exports.reconcileServiceLinks({ status: 'waiting' });
  assert.equal(sift(observed)({ patientId: selected, status: 'waiting' }), true);
  assert.equal(sift(observed)({ patientId: other, status: 'waiting' }), false);
});
test('nonpilot progress and outcome review cannot write, unlock evidence or inspect reports', async () => {
  const original = [process.env.HEALTH_MANAGEMENT_ROLLOUT_MODE, process.env.HEALTH_MANAGEMENT_PATIENT_IDS];
  Object.assign(process.env, { HEALTH_MANAGEMENT_ROLLOUT_MODE: 'allowlist', HEALTH_MANAGEMENT_PATIENT_IDS: selected });
  try {
    const blocked = () => assert.fail('nonpilot downstream access');
    const actor = { _id: 'owner', role: 'familyDoctor' };
    const task = { _id: 'task', patientId: other, assignedTo: actor._id, status: 'completed', outcomeReview: {}, outcomeClosureIntent: { status: 'completed' } };
    const args = { id: task._id, actor, body: { patientId: selected },
      FollowUp: { findById: () => ({ lean: async () => task }), findOneAndUpdate: blocked },
      User: { findById: () => ({ lean: async () => ({ assignedFamilyDoctor: actor._id }) }) },
      Report: { find: blocked }, Link: { find: blocked }, fence: blocked,
    };
    for (const run of [require('../src/utils/followUpProgress').saveProgress,
      require('../src/utils/followUpOutcomeReview').reviewOutcome,
      require('../src/utils/followUpOutcomeCandidates').outcomeCandidates]) {
      await assert.rejects(run(args), error => error.code === 'HEALTH_MANAGEMENT_NOT_ENABLED');
    }
    await require('../src/utils/followUpServiceLink').projectLink({ patientId: other, get followUpId() { return blocked(); } });
  } finally {
    ['HEALTH_MANAGEMENT_ROLLOUT_MODE', 'HEALTH_MANAGEMENT_PATIENT_IDS'].forEach((key, i) => {
      if (original[i] === undefined) delete process.env[key]; else process.env[key] = original[i];
    });
  }
});
test('production default, unknown mode and malformed allowlist fail closed', () => {
  assert.equal(enabledForPatient(selected, { NODE_ENV: 'production' }), false);
  assert.equal(enabledForPatient(selected, { ...env, HEALTH_MANAGEMENT_ROLLOUT_MODE: 'typo' }), false);
  for (const ids of ['', '金娟', selected + ',bad', selected + ',']) {
    const config = { ...env, HEALTH_MANAGEMENT_PATIENT_IDS: ids };
    assert.equal(enabledForPatient(selected, config), false);
    assert.deepEqual(patientFilter('user', config), { user: { $in: [] } });
  }
});
test('report routes gate the persisted owner for every action, including reject; nonpilot list is empty', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const rollout = require('../src/utils/healthManagementRollout');
  const paths = [];
  let writes = 0, lists = 0, owner = other;
  const row = () => ({ _id: '333333333333333333333333', patientId: owner, status: 'advisor_review', __v: 0 });
  const Draft = {
    findById: async () => row(),
    find: () => { lists++; return { sort: () => ({ limit: () => ({ lean: async () => [] }) }) }; },
    findOneAndUpdate: async () => { writes++; return { ...row(), status: 'rejected' }; },
  };
  const router = Object.fromEntries(['get', 'post'].map(method => [method, (path, ...handlers) => paths.push({ method, path, handler: handlers.at(-1) })]));
  const sandbox = { module: { exports: {} }, require: name => {
    if (name === 'express') return { Router: () => router };
    if (name === 'mongoose') return { isValidObjectId: () => true };
    if (name.endsWith('/staffAuth')) return () => {};
    if (name.endsWith('/ReportFollowUpDraft')) return Draft;
    if (name.endsWith('/healthManagementRollout')) return {
      enabledForPatient: id => rollout.enabledForPatient(id, env),
      assertPatientEnabled: id => { if (!rollout.enabledForPatient(id, env)) throw Object.assign(Error('disabled'), { statusCode: 403 }); },
    };
    if (name.endsWith('/reportFollowUpAutomation')) return { completeReportReview: async () => {} };
    if (name.endsWith('/assessmentFollowUpDrafts') || name.endsWith('/dynamicAssessmentFollowUps')) return {};
    throw Error('Unexpected dependency: ' + name);
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/routes/reportFollowUps'), 'utf8'), sandbox);
  sandbox.module.exports({ getVisiblePlanPatientIds: async () => [selected, other] });
  async function call(method, path, body = {}) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await paths.find(route => route.method === method && route.path === path).handler({ params: { id: row()._id, patientId: other }, staff: { role: 'familyDoctor', _id: 'advisor' }, body }, res);
    return res;
  }
  for (const action of ['approve', 'reject', 'take_over']) {
    const res = await call('post', '/:id/review', { action, revision: 0, patientId: selected, enabled: true });
    assert.equal(res.statusCode, 403);
  }
  assert.equal((await call('post', '/:id/generate', { patientId: selected })).statusCode, 403);
  const list = await call('get', '/patients/:patientId');
  assert.equal(list.body.enabled, false);
  assert.equal(list.body.data.length, 0);
  assert.equal(writes, 0); assert.equal(lists, 0);
  owner = selected;
  assert.equal((await call('post', '/:id/review', { action: 'reject', revision: 0 })).statusCode, 200);
  assert.equal(writes, 1);
});
test('annual checkup dispatch uses stored plan owner, not the supplied patient ID', async () => {
  const original = { mode: process.env.HEALTH_MANAGEMENT_ROLLOUT_MODE, ids: process.env.HEALTH_MANAGEMENT_PATIENT_IDS };
  Object.assign(process.env, { HEALTH_MANAGEMENT_ROLLOUT_MODE: 'allowlist', HEALTH_MANAGEMENT_PATIENT_IDS: selected });
  try {
    const { createCheckupDispatch } = require('../src/utils/annualCheckupDispatch');
    const blocked = () => assert.fail('nonpilot must not read downstream data or write tasks');
    const dispatch = createCheckupDispatch({
      AnnualPlan: { findById: () => ({ lean: async () => ({ _id: 'plan', patientId: other, checkupPreparationAutoConfirmedAt: new Date() }) }) },
      User: { findById: blocked }, FollowUp: { updateOne: blocked },
    }, blocked, () => true);
    assert.equal((await dispatch.sync({ _id: 'plan', patientId: selected, checkupPreparationAutoConfirmedAt: new Date() })).created, 0);
  } finally {
    for (const [key, value] of [['HEALTH_MANAGEMENT_ROLLOUT_MODE', original.mode], ['HEALTH_MANAGEMENT_PATIENT_IDS', original.ids]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
test('excluded assessment generation and publication stop before claims, AI and task writes', async () => {
  const original = { mode: process.env.HEALTH_MANAGEMENT_ROLLOUT_MODE, ids: process.env.HEALTH_MANAGEMENT_PATIENT_IDS };
  Object.assign(process.env, { HEALTH_MANAGEMENT_ROLLOUT_MODE: 'allowlist', HEALTH_MANAGEMENT_PATIENT_IDS: selected });
  try {
    const blocked = () => assert.fail('excluded patient has a side effect');
    const row = { _id: 'assessment', patientId: other, status: 'advisor_review', __v: 0 };
    const { runAssessmentDraft } = require('../src/utils/assessmentFollowUpAutomation');
    await assert.rejects(runAssessmentDraft(row._id, { revision: 0 }, {
      Assessment: { findById: () => ({ lean: async () => row }), findOneAndUpdate: blocked },
      chat: blocked, assertSource: blocked,
    }), error => error.statusCode === 403);
    const { publishAssessmentFollowUps } = require('../src/utils/dynamicAssessmentFollowUps');
    await assert.rejects(publishAssessmentFollowUps({ ...row, status: 'approved' }, {}, {
      User: { findById: blocked }, FollowUp: { updateOne: blocked },
    }), error => error.statusCode === 403);
  } finally {
    for (const [key, value] of [['HEALTH_MANAGEMENT_ROLLOUT_MODE', original.mode], ['HEALTH_MANAGEMENT_PATIENT_IDS', original.ids]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
test('allowlist uses verified identity, not name, request flag or another client', () => {
  for (const id of [selected, { _id: selected }, { toHexString: () => selected }]) assert.equal(enabledForPatient(id, env), true);
  for (const id of [other, null, {}, { name: '金娟', enabled: true }, { _id: other, enabled: true }]) assert.equal(enabledForPatient(id, env), false);
  assert.deepEqual(patientFilter('patientId', env), { patientId: { $in: [selected] } });
  assert.equal(policy({ NODE_ENV: 'test' }).mode, 'all');
});
test('report event creation preserves nonpilot data without reading clinical content', () => {
  const original = { mode: process.env.HEALTH_MANAGEMENT_ROLLOUT_MODE, ids: process.env.HEALTH_MANAGEMENT_PATIENT_IDS };
  Object.assign(process.env, { HEALTH_MANAGEMENT_ROLLOUT_MODE: 'allowlist', HEALTH_MANAGEMENT_PATIENT_IDS: selected });
  try {
    const { markReportFollowUpEvent } = require('../src/utils/reportFollowUpSource');
    const excluded = { user: other, get audit_status() { assert.fail('must stop before examining report'); } };
    markReportFollowUpEvent(excluded);
    const included = { user: selected, audit_status: 'audited', documentCategory: 'exam_report', isModified: () => true, title: 'Synthetic' };
    markReportFollowUpEvent(included);
    assert.equal(included.followUpSourceEvent.status, 'queued');
  } finally {
    for (const [key, value] of [['HEALTH_MANAGEMENT_ROLLOUT_MODE', original.mode], ['HEALTH_MANAGEMENT_PATIENT_IDS', original.ids]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
