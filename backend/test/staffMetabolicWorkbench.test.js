const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const React=require('react'),esbuild=require('esbuild');
function harness(initial=[],failure=false){
  let rows=initial,index=0,refIndex=0;const values=[],refs=[],effects=[],calls=[];
  const react={...React,useState:init=>{const i=index++;if(!(i in values))values[i]=typeof init==='function'?init():init;return[values[i],v=>values[i]=typeof v==='function'?v(values[i]):v]},useRef:init=>{const i=refIndex++;return refs[i]||(refs[i]={current:init})},useEffect:fn=>{if(!effects.length)effects.push(fn)}};
  const api={get:async()=>{if(failure)throw Error('测试加载失败');return{data:rows}},resolve:async(id,body)=>{calls.push({id,body});rows=rows.map(r=>r._id===id?{...r,help:{...r.help,status:'closed',reply:body.reply}}:r)}};
  const ctx={module:{exports:{}},require:name=>name==='react'?react:name.endsWith('/api')?{metabolicPilotAPI:api}:{},console};
  vm.runInNewContext(esbuild.transformSync(fs.readFileSync(path.join(__dirname,'../../staff/src/pages/MetabolicPilotPage.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code,ctx);
  const render=()=>{index=0;refIndex=0;return ctx.module.exports.default({api})};
  const nodes=()=>{const result=[];const walk=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o))return o.forEach(walk);result.push(o);walk(o.props?.children)};walk(render());return result};
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  return{render,nodes,calls,values,flush,load:async()=>{render();effects[0]();await flush()}};
}
const sample={_id:'synthetic-1',user:{name:'演示客户 A'},owner:{name:'测试健管'},canResolve:true,allowed:true,state:'active',revision:7,humanMinutes:0,startedAt:new Date(Date.now()-35*86400000).toISOString(),endsAt:new Date(Date.now()+49*86400000).toISOString(),help:{status:'open',requestedAt:new Date().toISOString(),message:'最近出差，想调整记录节奏，应该怎样设置？'},history:[]};
test('staff empty state guides enrollment, load failure never pretends zero customers',async()=>{
  const empty=harness();await empty.load();
  assert.ok(empty.nodes().some(n=>n.type==='h2'&&n.props.children.includes('等待首位客户')));
  const failed=harness([],true);await failed.load();assert.ok(failed.nodes().some(n=>n.props?.role==='alert'));
  assert.ok(!failed.nodes().some(n=>n.type==='h2'&&String(n.props.children).includes('等待首位客户')));
});
test('staff selects customer, validates reply and preserves revision and minutes',async()=>{
  const h=harness([sample]);await h.load();
  h.nodes().find(n=>n.props?.className?.startsWith('mw-person ')).props.onClick();
  assert.ok(h.nodes().some(n=>n.props?.role==='progressbar'&&n.props['aria-label'].includes('不代表')));
  h.nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'已说明如何调整提醒频率。'}});
  h.nodes().find(n=>n.props?.id==='mw-minutes').props.onChange({target:{value:'0'}});
  await h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(h.calls.length,0);
  h.nodes().find(n=>n.props?.id==='mw-minutes').props.onChange({target:{value:'2'}});
  const send=h.nodes().find(n=>n.type==='form').props.onSubmit;
  await Promise.all([send({preventDefault(){}}),send({preventDefault(){}})]);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.revision,7);assert.equal(h.calls[0].body.minutes,2);
  assert.ok(h.nodes().some(n=>n.props?.role==='status'));
});
test('refresh clears selected customer and stale reply draft',async()=>{
  const h=harness([sample]);await h.load();
  h.nodes().find(n=>n.props?.className?.startsWith('mw-person ')).props.onClick();
  h.nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'旧求助的回复'}});
  await h.nodes().find(n=>n.type==='button'&&n.props.children==='刷新工作台').props.onClick();
  assert.ok(!h.nodes().some(n=>n.type==='textarea'));
  h.nodes().find(n=>n.props?.className?.startsWith('mw-person ')).props.onClick();
  assert.equal(h.nodes().find(n=>n.type==='textarea').props.value,'');
});
test('generate synthetic preview of real staff component; never accesses production API',async()=>{
  if(process.env.METABOLIC_RENDER_PREVIEW!=='1')return;
  const h=harness([sample,{...sample,_id:'synthetic-2',user:{name:'演示客户 B'},state:'paused',help:{status:'closed',reply:'已按你的意愿暂停提醒。'},humanMinutes:3}]);await h.load();
  h.nodes().find(n=>n.props?.className?.startsWith('mw-person ')).props.onClick();
  const dir=path.join(__dirname,'../../tmp/metabolic-ui-preview');fs.mkdirSync(dir,{recursive:true});
  const css=fs.readFileSync(path.join(__dirname,'../../staff/src/index.css'),'utf8')+fs.readFileSync(path.join(__dirname,'../../staff/src/pages/MetabolicPilotPage.css'),'utf8');
  const wrap=tree=>'<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body><div style="padding:28px;max-width:1400px;margin:auto"><p style="color:#8c7b56;margin-bottom:20px">本地界面预览 · 全部为虚构数据 · 未连接生产</p>'+require('react-dom/server').renderToStaticMarkup(tree)+'</div></body></html>';
  fs.writeFileSync(path.join(dir,'index.html'),wrap(h.render()));
  const empty=harness();await empty.load();fs.writeFileSync(path.join(dir,'empty.html'),wrap(empty.render()));
});
