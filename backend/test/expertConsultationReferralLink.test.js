const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const router = require('../src/routes/expertConsultations');
const Case = require('../src/models/ExpertConsultationCase');
const Referral = require('../src/models/Referral');
const FollowUp = require('../src/models/FollowUp');
const MedicalExpert = require('../src/models/MedicalExpert');
const Admin = require('../src/models/Admin');

const oid = () => new mongoose.Types.ObjectId();
const handler = action => router.stack.find(layer => layer.route?.path === `/staff/:id/${action}` && layer.route.methods.post).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('consultation links one existing patient referral and rejects duplicate free-text or mismatched experts', async () => {
  const original = { findById: Case.findById, findOneAndUpdate: Referral.findOneAndUpdate,
    findOne: Referral.findOne, updateOne: Referral.updateOne, updateMany: FollowUp.updateMany,
    expertsFind: MedicalExpert.find, adminsFind: Admin.find };
  const caseId = oid(), tenantId = oid(), patientId = oid(), advisorId = oid(), plannerId = oid(), referralId = oid(), expertId = oid(), expertStaffId = oid(), otherExpertId = oid();
  const row = { _id: caseId, tenantId, patientId, advisorId, plannerId, type: 'single', status: 'advisor', history: [],
    async save() { this.saved = true; } };
  let claimFilter;
  Case.findById = async () => row;
  Referral.findOneAndUpdate = async filter => { claimFilter = filter; return { _id: referralId }; };
  Referral.findOne = () => ({ select: () => ({ lean: async () => ({ medicalExpertId: expertId }) }) });
  MedicalExpert.find = () => ({ select: () => ({ lean: async () => [{ _id: expertId, linkedStaffId: expertStaffId }] }) });
  Admin.find = () => ({ select: () => ({ lean: async () => [{ _id: expertStaffId }] }) });
  Referral.updateOne = async () => ({ modifiedCount: 1 });
  FollowUp.updateMany = async () => ({ modifiedCount: 0 });
  try {
    const call = async (action, staffId, body) => {
      const res = response();
      await handler(action)({ params: { id: String(caseId) }, staff: { _id: staffId }, body }, res);
      return res;
    };
    const freeText = await call('referral', advisorId, { purpose: '另写一份', questions: '重复问题' });
    assert.equal(freeText.statusCode, 400);
    assert.equal(row.saved, undefined);
    const linked = await call('referral', advisorId, { referralId: String(referralId) });
    assert.equal(linked.statusCode, 200);
    assert.equal(String(claimFilter.patientId), String(patientId));
    assert.equal(String(claimFilter.fromStaffId), String(advisorId));
    assert.equal(claimFilter.expertConsultationCaseId, null);
    assert.equal(String(row.referralId), String(referralId));
    assert.equal(row.status, 'planner');
    Referral.findOne = async () => ({ medicalExpertId: expertId });
    const mismatch = await call('assign', plannerId, { members: [{ expertId: otherExpertId, slotId: oid() }] });
    assert.equal(mismatch.statusCode, 409);
    assert.match(mismatch.body.message, /转介信所选专家/);
  } finally {
    Case.findById = original.findById;
    Referral.findOneAndUpdate = original.findOneAndUpdate;
    Referral.findOne = original.findOne;
    Referral.updateOne = original.updateOne;
    FollowUp.updateMany = original.updateMany;
    MedicalExpert.find = original.expertsFind;
    Admin.find = original.adminsFind;
  }
});
