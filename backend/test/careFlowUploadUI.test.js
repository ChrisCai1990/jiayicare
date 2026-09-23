const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const React=require('react'),esbuild=require('esbuild');
test('客户批次第二份失败时不结束提醒，重试跳过成功文件，全部成功才完成',async()=>{
  const initial={canUpload:true,completed:false,plans:[],reports:[]};
  const values=[initial,[{id:'one',title:'病历',category:'outpatient_record',uploadToken:'one'},{id:'two',title:'医嘱',category:'prescription_order',uploadToken:'two'}],false,'',true];
  let n=0,fail=true,completed=0;const added=[],lock={current:false};
  const react={...React,useEffect:()=>{},useRef:()=>lock,useState:init=>{const i=n++;if(values[i]===undefined)values[i]=init;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v}];}};
  const tasksAPI={addCareReport:async(id,row)=>{added.push(row.uploadToken);if(fail&&row.uploadToken==='two')throw Error('网络失败');return{data:initial}},completeCareReports:async()=>{completed++;return{data:{...initial,completed:true,canUpload:false}}}};
  const native=Object.fromEntries(['View','Text','ScrollView','TouchableOpacity','TextInput'].map(k=>[k,k]));
  const ctx={module:{exports:{}},require:name=>name==='react'?react:name==='react-native'?native:name.includes('/api')?{tasksAPI}:{} };
  vm.runInNewContext(esbuild.transformSync(fs.readFileSync(path.join(__dirname,'../../app/src/screens/records/CareReportUpload.js'),'utf8'),{loader:'jsx',format:'cjs'}).code,ctx);
  function render(){n=0;return ctx.module.exports.default({flowId:'flow',navigation:{}})}
  function submit(tree){let found;const walk=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o))return o.forEach(walk);if(o.type==='TouchableOpacity'&&o.props.children?.props?.children==='提交全部资料，完成本次上传')found=o;walk(o.props?.children)};walk(tree);return found.props.onPress()}
  await submit(render());assert.equal(completed,0);assert.equal(values[1][0].saved,true);assert.match(values[3],/成功项已保留/);
  fail=false;await submit(render());assert.equal(completed,1);assert.deepEqual(added,['one','two','two']);assert.equal(values[0].completed,true);
});
test('医护多文件分类、客户任务直达上传、小程序禁止直接跳过审核',()=>{
  const read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');
  const staff=read('staff/src/components/CareFlowReportUploads.jsx');assert.match(staff,/multiple/);for(const key of ['exam_report','outpatient_record','prescription_order'])assert.ok(staff.includes(key));assert.match(staff,/rows.filter\(r=>!r.saved\)/);
  const mini=read('miniprogram/src/pages/tasks/report-upload/index.jsx');assert.match(mini,/completeCareReports/);assert.match(mini,/addCareReport/);assert.match(mini,/if\(r.saved\)continue/);
  assert.match(read('miniprogram/src/pages/home/index.jsx'),/!isFollowup && !task.customerReadOnly/);
  assert.match(read('app/src/screens/tasks/TasksScreen.js'),/navigation.addListener\('focus', loadData\)/);
});
