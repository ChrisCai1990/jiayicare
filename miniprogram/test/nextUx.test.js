const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('home combines only the explicit same-flow arrangement/upload pair without mutating tasks',()=>{
  const {homeTaskCards}=moduleFor('utils/homeTaskCards.js');
  const arrangement={_id:'care-plan:f:arrangement',careFlowId:'f',customerReadOnly:true,title:'本次就医安排 · 检查',scheduleLabel:'已安排'};
  const upload={_id:'care-plan:f:upload',careFlowId:'f',customerReadOnly:true,canUploadReports:true,uploadReminder:true};
  const other={_id:'care-plan:g:upload',careFlowId:'g',customerReadOnly:true,canUploadReports:true,uploadReminder:true};
  const original=JSON.stringify([arrangement,upload,other]);
  const cards=homeTaskCards([arrangement,upload,other]);assert.equal(cards.length,2);assert.equal(cards[0].uploadTask,upload);assert.equal(cards[1],other);assert.equal(JSON.stringify([arrangement,upload,other]),original);
  assert.equal(homeTaskCards([arrangement,upload,{...upload}]).length,3);
  assert.equal(homeTaskCards([{...arrangement,_id:'legacy'},upload]).length,2);
  assert.equal(homeTaskCards([arrangement])[0].uploadTask,undefined);
});
function moduleFor(file, mocks = {}) {
  const code = babel.transformSync(read(file), { configFile:false, babelrc:false,
    presets:[require.resolve('@babel/preset-react')], plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const ctx = { exports:{}, require:name => { if (!(name in mocks)) throw Error('Unmocked '+name); return mocks[name]; }, setTimeout, clearTimeout, setInterval, clearInterval, console };
  vm.runInNewContext(code,ctx); return ctx.exports;
}

test('chat serializes slow requests, ignores pre-send responses, and resumes after hide', async () => {
  const {createRefreshController}=moduleFor('utils/refreshController.js');
  const requests=[], seen=[], errors=[], timers=new Map(); let next=0;
  const controller=createRefreshController({request:()=>{const d=deferred();requests.push(d);return d.promise;},onData:d=>seen.push(d),onError:e=>errors.push(e),timers:{setTimeout:f=>{timers.set(++next,f);return next;},clearTimeout:id=>timers.delete(id)}});
  const fire=()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
  controller.start();controller.start();controller.refresh();controller.refresh();assert.equal(requests.length,1);
  requests[0].resolve('old-before-send');await flush();assert.equal(seen.length,0);
  fire();assert.equal(requests.length,2);requests[1].resolve('new-with-sent-message');await flush();assert.deepEqual(seen,['new-with-sent-message']);
  fire();controller.stop();requests[2].resolve('hidden');await flush();assert.equal(timers.size,0);assert.equal(seen.length,1);
  controller.start();assert.equal(requests.length,4);requests[3].reject(Error('network'));await flush();assert.equal(errors.length,1);assert.equal(timers.size,1);
  controller.stop();assert.equal(timers.size,0);
});

test('manager entry validates fresh assignment, uses existing tab, consumes once, and cannot cross users', async () => {
  const calls=[],errors=[];let response={success:true,data:{_id:'u1',careTeam:[{kind:'healthManager',name:'测试健管'}]}};
  const api=moduleFor('utils/managerConversation.js',{'@tarojs/taro':{switchTab:async o=>calls.push(o.url),navigateTo:async o=>calls.push(o.url),showModal:o=>errors.push(o.content)},'../services/api':{userAPI:{getMe:async()=>response}}});
  await api.openManagerConversation('u1');assert.equal(calls[0],'/pages/chat/index');
  assert.equal(api.consumeManagerConversation('u1').role,'manager');assert.equal(api.consumeManagerConversation('u1'),null);
  await api.openManagerConversation('u1');assert.equal(api.consumeManagerConversation('u2'),null);
  response.data.careTeam=[];await api.openManagerConversation('u1');assert.match(errors.pop(),/暂未分配/);assert.equal(calls.length,2);
  response.data._id='u2';await api.openManagerConversation('u1');assert.match(errors.pop(),/身份/);
  await api.openManagerConversation(null);assert.equal(calls.at(-1),'/pages/auth/login/index');
});

function homeHarness() {
  const source=read('pages/home/index.jsx'),begin=source.indexOf('  const loadCore = useCallback'),end=source.indexOf('\n  useEffect',begin);
  const state={sections:{},tasks:[],followups:[],services:[],dashboard:null};
  const ds={dashboard:deferred(),tasks:deferred(),followups:deferred(),services:deferred()};
  const ctx={useCallback:f=>f,authLoading:false,token:'a',sessionRef:{current:'a'},loadRequestRef:{current:0},
    setLoading:v=>state.loading=v,setSectionState:v=>state.sections=typeof v==='function'?v(state.sections):v,
    setDashData:v=>state.dashboard=v,setTasks:v=>state.tasks=v,setFollowups:v=>state.followups=v,setPopularServices:v=>state.services=v,
    userAPI:{getDashboard:()=>ds.dashboard.promise},tasksAPI:{list:()=>ds.tasks.promise},followupTasksAPI:{list:()=>ds.followups.promise},servicesAPI:{list:()=>ds.services.promise}};
  vm.runInNewContext(source.slice(begin,end)+'\nthis.run=loadCore;',ctx);return {state,ds,ctx};
}
test('home shows tasks while services are pending and preserves failures as error, not empty success',async()=>{
  const {state,ds,ctx}=homeHarness(),p=ctx.run();
  ds.tasks.resolve({success:true,data:[{_id:'t',status:'pending'}]});await flush();assert.equal(state.tasks.length,1);assert.equal(state.sections.tasks,'ready');assert.equal(state.sections.services,'loading');
  ds.dashboard.reject(Error('offline'));ds.followups.resolve({success:true,data:[]});await flush();assert.equal(state.sections.dashboard,'error');
  ds.services.resolve({success:true,data:{services:[]}});await p;assert.equal(state.loading,false);assert.equal(state.sections.dashboard,'error');
});
test('responses issued under a previous home session cannot repopulate its private records',async()=>{
  const {state,ds,ctx}=homeHarness(),p=ctx.run();ctx.sessionRef.current='b';
  ds.tasks.resolve({success:true,data:[{_id:'old',status:'pending'}]});ds.followups.resolve({success:true,data:[]});ds.dashboard.resolve({success:true,data:{name:'old'}});ds.services.resolve({success:true,data:{services:[]}});await p;
  assert.equal(state.tasks.length,0);assert.equal(state.dashboard,null);
});

function uploadHarness({ failImage=false, failSave=false }={}) {
  const state=[],refs=[];let si=0,ri=0,pickCalls=0,createCalls=0,uploadCalls=0;
  const picker=deferred(),firstImage=deferred();
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:init=>{const i=si++;if(!(i in state))state[i]=typeof init==='function'?init():init;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useRef:init=>{const i=ri++;return refs[i]||(refs[i]={current:init});},useCallback:f=>f};
  const Page=moduleFor('pages/records/upload/index.jsx',{
    react:React,'@tarojs/components':{View:'View',Text:'Text',Button:'Button'},'@tarojs/taro':{useDidShow(){},getFileSystemManager:()=>({readFileSync:()=>'base64'}),showToast(){},showModal(){},navigateBack(){},switchTab(){}},
    '../../../theme':{colors:{},spacing:{},radius:{},shadow:{}},'../../../hooks/useNavBar':()=>({statusBarHeight:0}),'../../../components/Icon':'Icon',
    '../../../utils/imagePicker':{chooseImageWithPrivacy:()=>{pickCalls++;return picker.promise;},isImagePickerCancelled:e=>e.cancel,isPrivacyDeclarationMissing:()=>false,showImagePickerError(){}},
    '../../../services/api':{reportsAPI:{list:async()=>({success:true,data:[]}),uploadBase64:async()=>{uploadCalls++;if(failImage)return {success:false,message:'bad image'};if(uploadCalls===1)await firstImage.promise;return {success:true,data:{fileUrl:'image-'+uploadCalls}};},create:async()=>{createCalls++;if(failSave)throw Error('timeout');return {success:true};}}}
  }).default;
  const render=()=>{si=0;ri=0;return Page();};
  const flatten=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(flatten)];
  const button=()=>flatten(render()).find(n=>n.type==='Button');
  return {state,picker,firstImage,button,render,counts:()=>({pickCalls,createCalls,uploadCalls})};
}
test('report double tap opens one picker and progress cannot mark success before report creation',async()=>{
  const h=uploadHarness(),start=h.button().props.onClick,p=start();start();assert.equal(h.counts().pickCalls,1);assert.equal(h.button().props.disabled,true);
  h.picker.resolve({tempFilePaths:['a.jpg','b.jpg']});await flush();assert.equal(h.counts().createCalls,0);
  h.firstImage.resolve();await p;assert.equal(h.counts().uploadCalls,2);assert.equal(h.counts().createCalls,1);assert.equal(h.button().props.disabled,false);assert(h.state.some(s=>s?.stage==='报告已提交，等待服务团队处理'));
});
test('failed image never creates a partial report; uncertain save explicitly asks to check list',async()=>{
  const h=uploadHarness({failImage:true}),p=h.button().props.onClick();h.picker.resolve({tempFilePaths:['a.jpg']});await p;assert.equal(h.counts().createCalls,0);assert.equal(h.button().props.disabled,false);
  const k=uploadHarness({failSave:true}),q=k.button().props.onClick();k.picker.resolve({tempFilePaths:['a.jpg']});k.firstImage.resolve();await q;assert(k.state.some(s=>typeof s==='string'&&s.includes('保存结果尚未确认')));
});

test('direct manager entry renders the existing role thread and returns to all role conversations',async()=>{
  const states=[],refs=[];let si=0,ri=0,show,pending={role:'manager',member:{kind:'healthManager',name:'测试健管'}};
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:init=>{const i=si++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef:init=>{const i=ri++;return refs[i]||(refs[i]={current:init});},useCallback:f=>f,useEffect(){}};
  const api={list:async()=>({success:true,data:[]}),pending:async()=>({success:true,data:[]})};
  const Page=moduleFor('pages/messages/index.jsx',{
    react:React,'@tarojs/components':{View:'View',Text:'Text',Input:'Input',ScrollView:'ScrollView',Image:'Image'},
    '@tarojs/taro':{useDidShow:f=>show=f,useDidHide(){},getStorageSync(){}},
    '../../theme':{colors:{},spacing:{},radius:{},shadow:{}},'../../hooks/useNavBar':()=>({statusBarHeight:0}),
    '../../context/AuthContext':{useAuth:()=>({user:{_id:'u',careTeam:[{kind:'healthManager',name:'测试健管'}]}})},
    '../../services/api':{messagesAPI:api,pushRecordsAPI:api,questionnaireAPI:api},'../../components/Icon':'Icon',
    '../../utils/imagePicker':{},'../../utils/wechatPay':{},'../../utils/healthFundCheckout':{},
    '../../utils/unreadBadge':{refreshUnreadBadge(){},withUnreadBadgeUpdate:f=>f()},
    '../../utils/refreshController':{},'../../utils/managerConversation':{consumeManagerConversation:()=>{const value=pending;pending=null;return value;}}
  }).default;
  const render=()=>{si=0;ri=0;return Page({embedded:true});};
  render();show();await flush();const thread=render();assert.equal(thread.props.role,'manager');assert.equal(thread.props.member.name,'测试健管');assert.equal(typeof thread.type,'function');
  thread.props.onClose();const list=render();assert.equal(list.type,'View');
  clearInterval(refs.find(r=>r.current&&typeof r.current==='object'&&r.current._onTimeout)?.current);
  const {getConversationRole}=require('../../backend/src/utils/conversationRoles');
  assert.equal(getConversationRole(thread.props.role).staffRole,'healthManager');
});
