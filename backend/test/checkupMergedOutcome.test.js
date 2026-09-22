const test = require('node:test'), assert = require('node:assert/strict');
const { inputKey, digest, assertEvidence } = require('../src/utils/checkupMergedOutcome');
test('same decision replay ignores report ordering but not changed decision or content', () => {
  const body = { reportIds: ['a','b'], decision: 'new_plan', note: 'reviewed', checksComplete: true, reportDraftId:'d' };
  assert.equal(inputKey(body),inputKey({...body,reportIds:['b','a','a']}));
  for(const patch of [{decision:'no_further'},{note:'other'},{checksComplete:false},{reportDraftId:'other'},{reportIds:['a']}])
    assert.notEqual(inputKey(body),inputKey({...body,...patch}));
});
test('frozen reports, drafts and successors reject changed, missing or substituted evidence', () => {
  const rows = ['Report','Draft','FollowUp'].map((model,i)=>({model,row:{_id:String(i),status:'approved',content:'reviewed',updatedAt:'2026-09-22'}}));
  const saved=rows.map(e=>({model:e.model,id:e.row._id,digest:digest(e.row)}));
  assert.doesNotThrow(()=>assertEvidence(saved,rows));
  assert.doesNotThrow(()=>assertEvidence(saved,rows.map(e=>({...e,row:{...e.row,outcomeEvidenceLock:{token:'internal'}}}))));
  assert.throws(()=>assertEvidence(saved,rows.slice(1)),/依据已变化/);
  for(let i=0;i<rows.length;i++) {
    assert.throws(()=>assertEvidence(saved,rows.map((e,j)=>j===i?{...e,row:{...e.row,content:'changed'}}:e)),/依据已变化/);
    assert.throws(()=>assertEvidence(saved,rows.map((e,j)=>j===i?{...e,row:{...e.row,_id:'other'}}:e)),/依据已变化/);
  }
});
