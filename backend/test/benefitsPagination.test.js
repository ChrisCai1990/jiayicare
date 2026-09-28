const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{transformSync}=require('esbuild');
for(const file of ['miniprogram/src/pages/profile/benefits/index.jsx','app/src/screens/profile/BenefitsScreen.js']){
 test(file+' has separate fund view and bounded five-row pages',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');
  assert.doesNotThrow(()=>transformSync(source,{loader:'jsx'}));
  assert.match(source,/mineSection==='fund'/);
  assert.match(source,/slice\(\(fundPage-1\)\*5,fundPage\*5\)/);
  assert.match(source,/Math\.max\(1,p-1\)/);
  assert.match(source,/Math\.min\(fundPageCount,p\+1\)/);
  assert.match(source,/最近最多 100 条/);
  assert.match(source,/setFundPage\(1\)/);
 });
}
