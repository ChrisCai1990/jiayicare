const test = require('node:test');
const assert = require('node:assert/strict');
const MedicalReport = require('../src/models/MedicalReport');
const { validateDirectProxyMaterials } = require('../src/utils/medicalProxyWorkflow');
const { isNoReportMedicalProxyPilot } = require('../../shared/noReportMedicalProxyPilot.cjs');

const pilotId = '6ac476d54f62812b84dd5d35';
const otherId = '6ac476d54f62812b84dd5d36';

test('only the specified simulated customer can confirm a genuinely empty record', async () => {
  const originalCount = MedicalReport.countDocuments;
  const queries = [];
  try {
    MedicalReport.countDocuments = async filter => { queries.push(filter); return 0; };
    assert.equal(isNoReportMedicalProxyPilot(`KH-${pilotId.toUpperCase()}`), false);
    assert.equal(isNoReportMedicalProxyPilot(pilotId), true);
    await assert.rejects(validateDirectProxyMaterials(otherId, { selectedReportIds: [], noMaterialsConfirmed: true }), /至少一份已审核资料/);
    await assert.rejects(validateDirectProxyMaterials(pilotId, { selectedReportIds: [] }), /至少一份已审核资料/);
    const plan = { selectedReportIds: [], noMaterialsConfirmed: true };
    assert.deepEqual(await validateDirectProxyMaterials(pilotId, plan), []);
    assert.equal(plan.simulationTest, true);
    assert.deepEqual(queries.at(-1), { user: pilotId });
    MedicalReport.countDocuments = async filter => filter.audit_status ? 0 : 1;
    await assert.rejects(validateDirectProxyMaterials(pilotId, { selectedReportIds: [], noMaterialsConfirmed: true }), /已有资料/);
  } finally {
    MedicalReport.countDocuments = originalCount;
  }
});

test('the pilot still requires ownership and approval for any selected report', async () => {
  const originalCount = MedicalReport.countDocuments;
  try {
    MedicalReport.countDocuments = async () => 0;
    await assert.rejects(validateDirectProxyMaterials(pilotId, { selectedReportIds: ['report-1'], noMaterialsConfirmed: true }), /属于该客户且已审核/);
    MedicalReport.countDocuments = async () => 1;
    const plan = { selectedReportIds: ['report-1'], noMaterialsConfirmed: true };
    assert.deepEqual(await validateDirectProxyMaterials(pilotId, plan), ['report-1']);
    assert.equal(plan.noMaterialsConfirmed, false);
    assert.equal(plan.simulationTest, undefined);
  } finally {
    MedicalReport.countDocuments = originalCount;
  }
});
