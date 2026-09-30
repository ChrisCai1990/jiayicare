const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {transformSync}=require('esbuild'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<body></body>',{url:'http://localhost'});global.window=dom.window;global.document=dom.window.document;Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{createRoot}=require('react-dom/client'),act=React.act||require('react-dom/test-utils').act;
const writes=[],api={saveCoreArchive:async(...args)=>writes.push(args),reviewInitialArchive:async(...args)=>writes.push(args)};
const mod={exports:{}};
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src/components/CoreHealthArchive.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code,{module:mod,exports:mod.exports,require:n=>n==='react'?React:n==='../api'?{staffAPI:api}:{}});
async function mount(name,props) {const el=document.createElement('div');document.body.append(el);const root=createRoot(el);await act(async()=>root.render(React.createElement(mod.exports[name],props)));return {el,close:async()=>{await act(async()=>root.unmount());el.remove()}}}
const button=(el,text)=>[...el.querySelectorAll('button')].find(b=>b.textContent.includes(text));
test('family summary is immediately visible and opens a detailed form; viewing never writes',async()=>{
  const user={_id:'u',coreHealthArchive:{family:{presence:'present',revision:1,records:[{id:'f',disease:'示例疾病',relationship:'父亲',onsetAge:'50岁'}]}}};
  const h=await mount('CoreArchiveSection',{user,section:'family',canEdit:true,onSaved:async()=>{}});
  try {assert.match(h.el.textContent,/父亲.*示例疾病/);assert.match(h.el.textContent,/50岁/);assert.equal(writes.length,0);await act(async()=>button(h.el,'补充／修改').click());assert.ok(h.el.querySelector('.modal'));assert.match(h.el.textContent,/确诊时间/);await act(async()=>button(h.el,'保存档案').click());assert.equal(writes.at(-1)[1],'family');assert.equal(writes.at(-1)[2].revision,1);} finally {await h.close()}
});
test('symptoms keep current and prior records separate, prior entries remain viewable',async()=>{
  const h=await mount('CoreArchiveSection',{user:{_id:'u',coreHealthArchive:{symptom:{presence:'present',revision:1,records:[{id:'s1',symptom:'当前症状',status:'持续'},{id:'s2',symptom:'历史症状',status:'已结束'}]}}},section:'symptom',onNavigate:()=>{}});
  try {assert.match(h.el.textContent,/当前症状/);assert.doesNotMatch(h.el.textContent,/历史症状/);await act(async()=>button(h.el,'既往记录').click());assert.match(h.el.textContent,/历史症状/);assert.doesNotMatch(h.el.textContent,/当前症状/);} finally {await h.close()}
});
test('initial review shows six sections and submits checked source questions with both revisions',async()=>{
  const keys=['family','disease','allergy','medication','symptom','routine'];
  const h=await mount('InitialArchiveReview',{user:{_id:'u',healthProfile:{familyHistoryNote:'父亲疾病'},coreHealthArchive:{family:{presence:'present',revision:3}},initialArchiveReview:{revision:2,status:'pending',sections:Object.fromEntries(keys.map(k=>[k,{status:'pending'}])),items:[{section:'family',questionId:'q',path:'healthProfile.familyHistoryNote',label:'家族史',answer:'父亲疾病'}]}},canEdit:true,onSaved:async()=>{},onNavigate:()=>{}});
  try {assert.match(h.el.textContent,/0\/6/);await act(async()=>button(h.el,'复核').click());const checkbox=h.el.querySelector('input[type="checkbox"]');assert.ok(checkbox);await act(async()=>checkbox.click());await act(async()=>button(h.el,'确认已核实').click());const submitted=writes.at(-1)[2];assert.deepEqual(Array.from(submitted.checkedQuestionIds),['q']);assert.equal(submitted.revision,2);assert.equal(submitted.sectionRevision,3);} finally {await h.close()}
});
