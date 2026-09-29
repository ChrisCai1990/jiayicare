const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {transformSync}=require('esbuild'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<body></body>',{url:'http://localhost'});global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{createRoot}=require('react-dom/client'),act=React.act||require('react-dom/test-utils').act;
test('service association and daily review render without payment requirement or automatic writes',async()=>{
 let linked=0,chosen=0;const data={activities:[{key:'plan:p',planId:'p',title:'权益内协助',status:'active',records:[],tasks:[],diseaseIds:[]}],daily:[{_id:'h',label:'日常反馈',value:'症状变化'}]};
 const api={getDiseaseActivity:async()=>({data}),linkDiseaseService:async()=>{linked++}};
 const module={exports:{}};vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src/components/DiseaseActivityPanel.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code,{module,exports:module.exports,require:n=>n==='react'?React:n==='react-router-dom'?{useNavigate:()=>()=>{}}:n==='../api'?{staffAPI:api}:{useStaff:()=>({staff:{role:'familyDoctor'}})}});
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el),Panel=module.exports.default;
 const props={patientId:'p',dossier:{_id:'d',courseEntries:[]},onLinked:async()=>{},onChooseDaily:()=>{chosen++}};
 try{await act(async()=>root.render(React.createElement(Panel,props)));assert.match(el.textContent,/权益内协助/);assert.equal(linked,0);
 const button=[...el.querySelectorAll('button')].find(b=>b.textContent==='确认关联当前专病');await act(async()=>button.click());assert.equal(linked,1);
 await act(async()=>root.render(React.createElement(Panel,{...props,mode:'daily'})));assert.equal(chosen,0);await act(async()=>[...el.querySelectorAll('button')].find(b=>b.textContent==='核对并归档').click());assert.equal(chosen,1);
 }finally{await act(async()=>root.unmount());el.remove()}
});
