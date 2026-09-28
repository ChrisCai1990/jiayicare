const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{transformSync}=require('esbuild');
const data={plans:[{id:'test',name:'测试计划',source:'configuration',validFrom:'2026-06-01',validUntil:'2027-05-31',notice:'历史次数待核对',usage:[],groups:{features:['健康咨询','报告解读'],shared:[{name:'就医陪同',total:4,usageKnown:false,services:['医务代办','医疗代诊','就医陪同服务']}],independent:[{name:'营养评估',total:12,usageKnown:false}]}}]};
for(const file of ['miniprogram/src/components/MembershipBenefits.jsx','app/src/components/MembershipBenefits.js','staff/src/components/MembershipBenefitsSummary.jsx']){
  test(file+' renders grouped benefits without duplicate shared quota',()=>{
    const code=transformSync(fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8'),{loader:'jsx',format:'cjs'}).code;
    const mockReact={...React,useState:value=>[value===null?data:value,()=>{}],useEffect:()=>{}};
    const components={View:'div',Text:'span',TouchableOpacity:'button'};
    const context={module:{exports:{}},exports:{},require:name=>name==='react'?mockReact:name.includes('services/api')?{userAPI:{}}:components};
    vm.runInNewContext(code,context);
    const html=renderToStaticMarkup(React.createElement(context.module.exports.default,{data,onRefresh:()=>{}}));
    assert.match(html,/健康管理服务/);
    assert.match(html,/服务共用次数/);
    assert.match(html,/独立次数权益/);
    assert.equal((html.match(/4 次/g)||[]).length,1);
    assert.equal((html.match(/12 次/g)||[]).length,1);
    assert.match(html,/医务代办、医疗代诊、就医陪同服务/);
    assert.match(html,/使用情况待核对/);
    assert.doesNotMatch(html,/剩余 4 次/);
  });
}
