const test = require('node:test');
const assert = require('node:assert/strict');
const { completePhaseAssessmentArchive } = require('../src/utils/phaseAssessmentArchive');
const copy = value => structuredClone(value);
function fixture() {
  let row = { _id: 'assessment', patientId: 'patient', status: 'archive_pending', content: '已审核的内容', periodLabel: '第三季度', finalizedBy: 'original', finalizedByName: '原顾问', finalizedByRole: 'familyDoctor', finalizedAt: new Date(), finalReviewRole: 'familyDoctor', reviewNote: '原审核备注', __v: 1, auditLog: [] };
  let record = null; let inserts = 0;
  const models = {
    PhaseAssessment: {
      findOneAndUpdate: async (filter, update) => {
        if (filter.status !== row.status) return null;
        Object.assign(row, update.$set); row.__v += update.$inc?.__v || 0;
        if (update.$push?.auditLog) row.auditLog.push(update.$push.auditLog);
        return copy(row);
      },
      findOne: async () => copy(row),
    },
    ServiceRecord: {
      findOneAndUpdate: async (filter, update) => {
        assert.equal(filter.sourcePhaseAssessmentId, 'assessment');
        assert.equal(update.$set, undefined, '重试禁止覆盖已存在归档');
        if (!record) { inserts++; record = { ...update.$setOnInsert, _id: 'record' }; }
        return copy(record);
      },
      findOne: async () => copy(record),
    },
  };
  const run = snapshot => completePhaseAssessmentArchive(snapshot || copy(row), { _id: 'patient' }, { _id: 'replacement', name: '接任顾问', role: 'familyDoctor' }, models);
  return { models, run, row: () => copy(row), record: () => copy(record), inserts: () => inserts };
}
test('新任同岗人员恢复归档，原审核身份与备注不变', async () => {
  const f = fixture(); const result = await f.run();
  assert.equal(result.data.status, 'finalized'); assert.equal(f.record().staffId, 'original');
  assert.equal(f.record().writeback.reviewedByName, '原顾问'); assert.equal(f.record().result, '原审核备注');
  assert.equal(result.data.auditLog[0].staffId, 'replacement');
});
test('归档写入后状态回写失败，重试复用原档案且只完成一次', async () => {
  const f = fixture(); const save = f.models.PhaseAssessment.findOneAndUpdate; let fail = true;
  f.models.PhaseAssessment.findOneAndUpdate = async (filter, update) => {
    if (update.$set.status === 'finalized' && fail) { fail = false; throw new Error('回写失败'); }
    return save(filter, update);
  };
  assert.equal((await f.run()).data.status, 'archive_pending'); assert.equal(f.inserts(), 1);
  assert.equal((await f.run()).data.status, 'finalized'); assert.equal(f.inserts(), 1);
  assert.equal(f.row().auditLog.length, 1);
});
test('重复并发重试只有一份档案及一次完成审计', async () => {
  const f = fixture(); const snapshot = f.row();
  const results = await Promise.all([f.run(copy(snapshot)), f.run(copy(snapshot))]);
  assert.ok(results.every(result => result.data.status === 'finalized'));
  assert.equal(f.inserts(), 1); assert.equal(f.row().auditLog.length, 1);
});
test('并发失败的迟到回写不把完成状态降级', async () => {
  const f = fixture(); const snapshot = f.row(); await f.run();
  f.models.ServiceRecord.findOneAndUpdate = async () => { throw new Error('迟到失败'); };
  assert.equal((await f.run(snapshot)).data.status, 'finalized'); assert.equal(f.row().archiveError, '');
});
test('并发唯一键冲突读取已存在档案后完成', async () => {
  const f = fixture(); const snapshot = f.row(); const insert = f.models.ServiceRecord.findOneAndUpdate;
  f.models.ServiceRecord.findOneAndUpdate = async (...args) => {
    await insert(...args); throw Object.assign(new Error('重复键'), { code: 11000 });
  };
  assert.equal((await f.run(snapshot)).data.status, 'finalized'); assert.equal(f.inserts(), 1);
});
test('草稿或缺少审核身份的记录不能归档', async () => {
  const f = fixture();
  await assert.rejects(f.run({ ...f.row(), status: 'doctor_review' }), /缺少已确认/);
  await assert.rejects(f.run({ ...f.row(), finalizedBy: null }), /缺少已确认/);
  assert.equal(f.inserts(), 0);
});
