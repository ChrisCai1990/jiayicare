const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {transformSync}=require('esbuild'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<body></body>',{url:'http://localhost'});global.window=dom.window;global.document=dom.window.document;Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{createRoot}=require('react-dom/client'),act=React.act||require('react-dom/test-utils').act;
const writes=[],api={saveCoreArchive:async(...args)=>writes.push(args),reviewInitialArchive:async(...args)=>writes.push(args)};
const mod={exports:{}};
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src/components/CoreHealthArchive.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code,{module:mod,exports:mod.exports,require:n=>n==='react'?React:n==='../api'?{staffAPI:api}:{}});
async function mount(name,props) {const el=document.createElement('div');document.body.append(el);const root=createRoot(el);await act(async()=>root.render(React.createElement(mod.exports[name],props)));return {el,close:async()=>{await act(async()=>root.unmount());el.remove()}}}
const button=(el,text)=>[...el.querySelectorAll('button')].find(b=>b.textContent.includes(text));
test('family section starts collapsed and opens a detailed form; viewing never writes',async()=>{
  const user={_id:'u',coreHealthArchive:{family:{presence:'present',revision:1,records:[{id:'f',disease:'示例疾病',relationship:'父亲',onsetAge:'50岁'}]}}};
  const h=await mount('CoreArchiveSection',{user,section:'family',canEdit:true,onSaved:async()=>{}});
  try {assert.match(h.el.textContent,/父亲.*示例疾病/);assert.equal(h.el.querySelector('#core-body-family').hidden,true);await act(async()=>button(h.el,'家族史').click());assert.equal(h.el.querySelector('#core-body-family').hidden,false);assert.match(h.el.textContent,/50岁/);assert.equal(writes.length,0);await act(async()=>button(h.el,'补充／修改').click());assert.ok(h.el.querySelector('.modal'));assert.match(h.el.textContent,/确诊时间/);await act(async()=>button(h.el,'保存档案').click());assert.equal(writes.at(-1)[1],'family');assert.equal(writes.at(-1)[2].revision,1);} finally {await h.close()}
});
test('intake symptoms are separate from daily complaints and collapse both section and date-first rows',async()=>{
  const h=await mount('CoreArchiveSection',{user:{_id:'u',coreHealthArchive:{symptom:{presence:'present',revision:1,records:[{id:'s1',symptom:'建档时乏力',startedAt:'2024年',status:'持续'},{id:'s2',symptom:'既往不适',status:'已结束'}]}}},section:'symptom',onNavigate:()=>{}});
  try {assert.equal(h.el.querySelector('#core-body-symptom').hidden,true);assert.match(h.el.textContent,/建档前近3个月或更长时间/);await act(async()=>button(h.el,'建档主诉与症状').click());const rows=h.el.querySelectorAll('details.core-record');assert.equal(rows.length,2);assert.equal(rows[0].open,false);assert.match(rows[0].querySelector('summary').textContent,/2024年 · 建档时乏力/);assert.equal(button(h.el,'当前不适'),undefined);} finally {await h.close()}
});
test('initial review shows six sections and submits checked source questions with both revisions',async()=>{
  const keys=['family','disease','allergy','medication','symptom','routine'];
  const h=await mount('InitialArchiveReview',{user:{_id:'u',healthProfile:{familyHistoryNote:'父亲疾病'},coreHealthArchive:{family:{presence:'present',revision:3}},initialArchiveReview:{revision:2,status:'pending',sections:Object.fromEntries(keys.map(k=>[k,{status:'pending'}])),items:[{section:'family',questionId:'q',path:'healthProfile.familyHistoryNote',label:'家族史',answer:'父亲疾病'}]}},canEdit:true,onSaved:async()=>{},onNavigate:()=>{}});
  try {assert.match(h.el.textContent,/0\/6/);await act(async()=>button(h.el,'复核').click());const checkbox=h.el.querySelector('input[type="checkbox"]');assert.ok(checkbox);await act(async()=>checkbox.click());await act(async()=>button(h.el,'确认已核实').click());const submitted=writes.at(-1)[2];assert.deepEqual(Array.from(submitted.checkedQuestionIds),['q']);assert.equal(submitted.revision,2);assert.equal(submitted.sectionRevision,3);} finally {await h.close()}
});

test('baseline medication section uses saved initial data without requesting current medications',async()=>{
 const h=await mount('CoreArchiveSection',{user:{_id:'u',healthProfile:{medicHistory:'否'},coreHealthArchive:{medication:{revision:1,presence:'present',records:[{id:'m',name:'首次药物',dosage:'首次剂量'}]}}},section:'medication'});
 try{assert.match(h.el.textContent,/首次建档用药/);assert.match(h.el.textContent,/首次药物/);assert.match(h.el.textContent,/首次剂量/);assert.equal(h.el.querySelector('details.core-source').open,false);}finally{await h.close()}
});
