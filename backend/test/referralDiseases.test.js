const test = require('node:test');
const assert = require('node:assert/strict');
const { selectReferralDiseases, diseaseSnapshot } = require('../src/utils/referralDiseases');
const { recruitmentProfile } = require('../src/utils/recruitmentProfile');
test('multi disease selection is deduplicated and restricted to this patient; legacy supported', () => {
  const rows = [{_id:'a',name:'甲'}, {_id:'b',name:'乙'}];
  assert.deepEqual(selectReferralDiseases({linkedDiseaseRecordIds:['b','a','b']},rows).map(r=>r.name),['乙','甲']);
  assert.throws(()=>selectReferralDiseases({linkedDiseaseRecordIds:['other']},rows));
  assert.equal(selectReferralDiseases({linkedDiseaseRecordId:'a'},rows)[0].name,'甲');
  assert.deepEqual(selectReferralDiseases({linkedDiseaseRecordIds:[],linkedDiseaseRecordId:'a'},rows),[]);
  assert.equal(diseaseSnapshot(rows[0]).name,'甲');
});
test('profile sync uses current expertise wording without duplicates or empty-field erasure', () => {
  assert.deepEqual(recruitmentProfile({registrationScope:'新擅长',expertise:['旧内容'],education:''}),{expertise:['新擅长']});
  assert.equal(recruitmentProfile({education:'本科',experienceYears:20}).education,'本科');
});
