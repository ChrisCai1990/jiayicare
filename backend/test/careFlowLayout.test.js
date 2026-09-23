const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const staffRequire=require('node:module').createRequire(path.join(__dirname,'../../staff/package.json'));
const React=staffRequire('react'),{renderToStaticMarkup}=staffRequire('react-dom/server');
const config=require('../../shared/careFlow.cjs');
function render(stage,own=true){
  const role=config.roles[stage],staff={_id:own?role:'other',role};
  const people=Object.fromEntries([...new Set(Object.values(config.roles))].map(role=>[role,{id:role,role,name:role}]));
  const data={_id:'flow',revision:1,patientId:'patient',reports:[],assistants:[],events:[],state:{stage,title:'测试事项',people,returns:[],data:{advisor:{text:'医院：医院甲\n科室：内科\n原因：既往结果需核对\n项目：复诊'},draft:{content:'顾问待审核的草稿',date:''},upload:{reportIds:[]}}}};
  let n=0;const fakeReact={...React,useEffect:()=>{},useState:init=>[n++===0?data:typeof init==='function'?init():init,()=>{}]};
  const ctx={module:{exports:{}},require:name=>name==='react'?fakeReact:name==='../api'?{careFlowAPI:{}}:name.includes('/shared/')?require(path.join(__dirname,'../../shared',path.basename(name))):{}};
  vm.runInNewContext(require('esbuild').transformSync(fs.readFileSync(path.join(__dirname,'../../staff/src/components/CareFlowCard.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code,ctx);
  return renderToStaticMarkup(React.createElement(ctx.module.exports.default,{task:{_id:'task'},staff}));
}
for(const stage of config.stages)test(`实际组件渲染 ${stage}，显示交接与留痕，无编辑删除`,()=>{
  const html=render(stage);assert.ok(html.includes('就医目的与专家沟通'));assert.ok(html.includes('完整流转及修订记录'));
  assert.ok(!html.includes('>删除<'));assert.ok(!html.includes('>编辑<'));
  if(stage!=='advisor'){
    assert.ok(html.includes('aria-label="退回修订"'));
    assert.ok(html.includes('①选择退回环节和负责人'));
    assert.ok(html.indexOf('aria-label="退回修订"')<html.indexOf('就医目的与专家沟通'));
    assert.ok(!html.includes('<summary>退回'));
  }
  if(stage==='review')assert.ok(html.includes('审核通过，生成随访任务并结束服务'));
});
test('其他参与人只读，不能提交或回退当前阶段',()=>{const html=render('execute',false);assert.ok(html.includes('等待当前负责人处理'));assert.ok(!html.includes('确认回退并留痕'));assert.ok(!html.includes('完成本环节，交下一步'));});
