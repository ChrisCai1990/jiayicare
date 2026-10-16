// Verify the exact expression shipped in each patched deployed chunk.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts/ai-label-candidate-20261016');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const cases=[
 [{isAI:true,sender:'顾问'},'嘉医助手 · AI生成'],
 [{isAI:false,aiGenerated:true,sender:'王顾问'},'王顾问 · AI辅助生成'],
 [{aiGenerated:true},'健康顾问 · AI辅助生成'],
 [{isAI:false,aiGenerated:false,sender:'王顾问'},'王顾问'],
 [{sender:'AI生成这几个字是姓名的一部分'},'AI生成这几个字是姓名的一部分'],
 [{isAI:'false',aiGenerated:'false',sender:'王顾问'},'王顾问'],
 [{isAI:true,aiGenerated:true},'嘉医助手 · AI生成']
];
let assertions=0;
for(const file of manifest.files){
 const full=path.join(dir,file.scope,file.name),s=fs.readFileSync(full,'utf8');
 if(file.kind!=='html')cp.execFileSync(process.execPath,['--check',full]);
 if(/^(63|596)\./.test(file.name)){
  const match=s.match(/children:(e\.isAI===true\?.*?)\}\),e\.audioUrl/); assert.ok(match,file.name);
  for(const [message,expected] of cases){assert.equal(vm.runInNewContext(match[1],{e:message,it:'嘉医助手',I:x=>x,ot:{label:'健康顾问'}}),expected);assertions++;}
 }
 if(/^200\./.test(file.name)){
  assert.ok(s.includes('fontSize:"14px",lineHeight:"21px",fontWeight:700},children:"本页面健康信息整理与趋势分析由人工智能（AI）生成"'));assertions++;
 }
}
const result={passed:true,assertions,scope:'deployed-expression and syntax regression; no real AI calls or device evidence'};
fs.writeFileSync(path.join(dir,'test-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
