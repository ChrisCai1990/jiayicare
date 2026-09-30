const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const preview=require('../../shared/healthFundPreview');
const {productDeductionLimit}=require('../src/utils/healthFundPayment');
function server(config={}) {
  const mocks={
    '../models/Enterprise':{findById:async()=>config.enterprise},
    '../models/SystemConfig':{findOne:()=>({lean:async()=>null})},
    '../models/Product':{findById:()=>({select:()=>({lean:async()=>({healthFundDeduction:config.rule})})})},
    './packageFeatureEntitlements':{hasHealthFundAccess:async()=>config.eligible!==false},
    mongoose:{Types:{ObjectId:{isValid:()=>true}}},
  };
  const ctx={module:{exports:{}},require:name=>mocks[name]||{},console};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/healthFundPayment'),'utf8')+`
    getPersonalFundAvailable=async()=>${config.personal??1000};
    getCorporateFundAvailable=async()=>${config.corporate??1000};`,ctx);
  return (requested,maximize=false)=>ctx.module.exports.validateHealthFundDeduction({user:{_id:'synthetic',enterpriseId:config.enterprise?'enterprise':undefined},requested,orderAmount:100,productId:'product',category:'test',productLimit:config.productLimit,maximize});
}
test('single-product request is a ceiling, never a second percentage base',async()=>{
  const validate=server();
  for(const [request,expected] of [[20,20],[5,5],[99,20],[0,0]])assert.equal((await validate(request)).allowed,expected);
  assert.equal((await validate(5,true)).allowed,20);
});
test('single-product preview agrees with actual validator across product rules and fund sources',async()=>{
  for(const rule of [undefined,{mode:'disabled'},{mode:'percentage',value:5},{mode:'percentage',value:30},{mode:'percentage',value:100},{mode:'fixedAmount',value:8},{mode:'unlimited'}]){
    for(const [personal,corporate] of [[0,0],[4,580],[580,0],[0,580]]){
      const estimate=preview.maxFundDeduction({eligible:true,personal,corporate},100,{id:'product',category:'test',healthFundDeduction:rule});
      const result=await server({rule,personal,corporate})(100);
      assert.equal(estimate,result.allowed,JSON.stringify({rule,personal,corporate}));
      assert.equal(Math.round((result.breakdown.personal+result.breakdown.corporate)*100),Math.round(result.allowed*100));
      assert.ok(estimate<=productDeductionLimit(rule,100));
    }
  }
});
test('membership missing or denied cannot preview a deduction; server still rejects denied access',async()=>{
  assert.equal(preview.maxFundDeduction({personal:1000},100,{}),0);
  assert.equal(preview.maxFundDeduction({eligible:false,personal:1000},100,{}),0);
  await assert.rejects(server({eligible:false})(20),/健康基金仅限/);
});
test('group preview respects each product cap, shared balance and coupon cents',()=>{
  const products=[{price:6800,fundProduct:{id:'a'}},{price:318.44,fundProduct:{id:'b'}}];
  assert.equal(preview.maxGroupFundDeduction({eligible:true,personal:9000},7118.44,products),1423.68);
  assert.equal(preview.maxGroupFundDeduction({eligible:true,personal:4,corporate:100,total:68},7118.44,products),68);
  products[1].fundProduct.healthFundDeduction={mode:'disabled'};
  assert.equal(preview.maxGroupFundDeduction({eligible:true,personal:9000},7118.44,products),1360);
  assert.equal(preview.maxGroupFundDeduction({eligible:true,personal:9000},0,products),0);
  assert.equal(preview.maxGroupFundDeduction({eligible:true,personal:9000},100,[{price:100}]),0);
});
test('inactive enterprise blocks corporate funds but single-product personal balance remains capped',async()=>{
  const healthFund={eligible:true,personal:4,corporate:100,enterprise:{bound:true,active:false}};
  assert.equal(preview.maxFundDeduction(healthFund,100,{}),4);
  assert.equal((await server({personal:4,corporate:100,enterprise:{status:'inactive'}})(20)).allowed,4);
  assert.equal(preview.maxGroupFundDeduction(healthFund,100,[{price:100,fundProduct:{id:'a'}}]),0);
});

test('explicit aggregate limit can cover a whole order without falling back to legacy 20 percent', async()=>{
  assert.equal((await server({productLimit:100})(100)).allowed,100);
  assert.equal((await server({productLimit:30})(100)).allowed,30);
});
