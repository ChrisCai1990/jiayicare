const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {transformSync}=require('esbuild'),{JSDOM}=require('jsdom'),React=require('react'),{createRoot}=require('react-dom/client');
const dom=new JSDOM('<html><body></body></html>');global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;global.IS_REACT_ACT_ENVIRONMENT=true;
const act=React.act||require('react-dom/test-utils').act;
test('archived report opens a read-only record without generating or reviewing; unlinked report retains explicit actions',async()=>{
 const module={exports:{}};let reviews=0;
 const helpers=require('../../shared/diseaseReportArchive.cjs');
 const api={getPatientReports:async()=>({data:[{_id:'r',title:'已入档病历',documentCategory:'exam_report',audit_status:'audited',healthCourseDraft:{status:'pending_review'}},{_id:'new',title:'新增病历',documentCategory:'exam_report',audit_status:'audited'}]})};
 vm.runInNewContext(transformSync(fs.readFileSync(require.resolve('../src/components/DiseaseReportPicker.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code,{module,exports:module.exports,require:n=>n==='react'?React:n==='../api'?{staffAPI:api}:helpers});
 const dossier={_id:'d',name:'专病',courseEntries:[{_id:'e',sourceReportId:'r',content:'已确认的历史记录'}]};const box=document.createElement('div');document.body.append(box);const root=createRoot(box);
 const click=async name=>{const b=[...box.querySelectorAll('button')].find(b=>b.textContent===name);assert.ok(b,name);await act(async()=>b.click())};
 try{await act(async()=>root.render(React.createElement(module.exports.default,{patientId:'p',dossier,records:[dossier],canReview:true,onReview:()=>reviews++,onClose:()=>{},onUpload:()=>{},onViewSource:()=>{},onSaved:async()=>{}})));
 assert.ok(box.textContent.includes('新增病历'));assert.ok(!box.textContent.includes('已入档病历'));await click('本专病已归档');assert.ok(box.textContent.includes('已入档病历'));assert.ok(!box.textContent.includes('审核新增诊疗草稿'));await click('查看诊疗记录');assert.ok(box.textContent.includes('已确认的历史记录'));assert.equal(reviews,0);
 }finally{await act(async()=>root.unmount());box.remove()}
});
