// Real local Mongo persistence regression; synthetic input, not clinical acceptance.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

async function main() {
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  const database = `jiayicare_acceptance_${crypto.randomBytes(16).toString('hex')}`;
  await mongoose.connect(`mongodb://127.0.0.1:27134/${database}`, { serverSelectionTimeoutMS: 3000 });
  const FollowUpPlan = require('../../src/models/FollowUpPlan');
  const FollowUp = require('../../src/models/FollowUp');
  const User = require('../../src/models/User');
  const { ensureCheckupTasks } = require('../../src/utils/checkupOneStopFlow');
  const oid = () => new mongoose.Types.ObjectId();
  const patientId = oid();
  await User.collection.insertOne({ _id: patientId, name: '隔离固定链回归（虚构）', assignedFamilyDoctor: oid(), assignedHealthPlanner: oid(), assignedMedicalAssistant: oid(), assignedHealthManager: oid() });
  const stages = ['plan_design', 'booking', 'onsite', 'report_collection', 'result_review', 'final_acceptance', 'abnormal_followup'];
  const roles = ['familyDoctor', 'healthPlanner', 'medicalAssistant', 'healthManager', 'familyDoctor', 'healthPlanner', 'familyDoctor'];
  const schemes = await FollowUpPlan.insertMany(stages.map((stage, i) => ({ name: `隔离${stage}`, workflowStageKey: stage, executorRole: roles[i] })));
  const plan = { _id: oid(), patientId, staffId: oid(), type: 'medical_assist', content: { serviceDomain: 'annual_checkup', followUpPlans: schemes.map((s, i) => ({ id: s._id, mode: i === 6 ? 'conditional' : 'fixed' })) } };
  const first = await ensureCheckupTasks(plan);
  const second = await ensureCheckupTasks(plan);
  assert.equal(Object.keys(first).length, 6);
  assert.deepEqual(Object.values(second).map(t => String(t._id)), Object.values(first).map(t => String(t._id)));
  assert.equal(await FollowUp.countDocuments({ sourceHealthPlanId: plan._id }), 6);
  assert.equal(await FollowUp.countDocuments({ followUpSchemeId: schemes[6]._id }), 0);
  console.log(JSON.stringify({ database, checks: ['six fixed tasks persisted', 'replay reuses exact task IDs', 'conditional task absent'], synthetic: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
