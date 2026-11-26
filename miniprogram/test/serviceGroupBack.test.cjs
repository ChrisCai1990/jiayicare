const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {transformSync}=require('esbuild'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{createRoot}=require('react-dom/client'),act=React.act||require('react-dom/test-utils').act;
test('group list and conversation use separate navigation entries and allow repeated entry',async()=>{
 let listResolve,late=false,switched='';
 const group={id:'synthetic',name:'合成服务群',status:'active',staff:[]};
 const api={list:()=>late?new Promise(resolve=>listResolve=resolve):Promise.resolve({data:[group]}),messages:async()=>({data:[]})};
 const pages=[{id:''}];
 const taro={
   getCurrentInstance:()=>({router:{params:{groupId:pages.at(-1).id}}}),
   getCurrentPages:()=>pages,
   navigateTo:async({url})=>{assert.equal(url,'/pages/messages/service-group/index?groupId=synthetic');pages.push({id:'synthetic'});},
   navigateBack:async()=>{pages.pop();},
   switchTab:async({url})=>{switched=url;},hideKeyboard:async()=>{}
 };
 const View=({children,onClick,style})=>React.createElement('div',{onClick,style},children);
 const mocks={'react':React,'@tarojs/components':{View,Text:View,ScrollView:View,Textarea:({value,placeholder})=>React.createElement('textarea',{value,placeholder,onChange:()=>{}}),Image:'img'},'@tarojs/taro':{...taro,default:taro,useDidShow:()=>{},useDidHide:()=>{}},'../../../services/api':{inAppServiceGroupAPI:api,mediaUrl:v=>v},'../../../theme':{colors:{},spacing:{lg:16,md:12},radius:{}},'../../../hooks/useNavBar':()=>({statusBarHeight:0,totalHeight:0})};
 const src=fs.readFileSync(path.join(__dirname,'../src/pages/messages/service-group/index.jsx'),'utf8');
 const code=transformSync(src,{loader:'jsx',format:'cjs',define:{'process.env.TARO_ENV':'"weapp"'}}).code;
 const module={exports:{}};let tick;
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>mocks[name]||(()=>null),console,setInterval:fn=>{tick=fn;return 1},clearInterval:()=>{},setTimeout,clearTimeout,process:{env:{TARO_ENV:'weapp'}}});
 const root=createRoot(document.getElementById('root'));
 const renderRoute=()=>act(async()=>root.render(React.createElement(module.exports.default,{key:pages.length})));
 const back=()=>[...document.querySelectorAll('div')].find(el=>el.textContent==='‹ 返回');
 await renderRoute();
 for (let visit=0;visit<2;visit++) {
   const card=[...document.querySelectorAll('div')].find(el=>[...el.children].some(child=>child.textContent==='暂无消息'));
   assert.ok(card);
   await act(async()=>card.click());
   assert.equal(pages.length,2);
   await renderRoute();
   assert.ok(document.querySelector('textarea'));
   await act(async()=>back().click());
   assert.equal(pages.length,1);
   await renderRoute();
 }
 await act(async()=>back().click());
 assert.equal(switched,'/pages/chat/index');
 await act(async()=>root.unmount());
});
