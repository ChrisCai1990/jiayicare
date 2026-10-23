const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/routes/inventory'), 'utf8');
function setup() {
  const handlers = {}; const entries = [];
  const material = { _id:'material', tenantId:'tenant', name:'血糖传感器', stock:8, linkedProductIds:['monitor','diabetes'], inventoryTracking:{ enabled:true, kind:'consumable', unit:'件' } };
  const products = [{ _id:'monitor', originalPrice:200 }, { _id:'diabetes', originalPrice:2000 }];
  const chain = rows => ({ select(){return this}, sort(){return this}, limit(){return this}, populate(){return this}, lean:async()=>rows });
  const Material = {
    findOne:async filter => { assert.equal(filter.tenantId,'tenant'); return filter._id === 'material' ? material : null; },
    findOneAndUpdate:async (filter, update) => { assert.equal(filter.tenantId,'tenant'); if (filter.stock?.$gte > material.stock) return null; material.stock += update.$inc.stock; return material; },
    updateOne:async (_filter, update) => { material.stock += update.$inc.stock; },
    create:async row => ({ ...row, _id:'new-material' }), deleteOne:async()=>{},
  };
  const mocks = {
    express:{ Router:()=>({ use(){}, get(){}, post(path, ...fn){ handlers[path] ||= fn.at(-1) }, patch(path,...fn){ handlers[path] ||= fn.at(-1) } }) },
    mongoose:{ isValidObjectId:value=>typeof value === 'string' && value.length > 0 },
    '../models/Product':{ countDocuments:async filter=>filter._id.$in.filter(id=>products.some(p=>p._id===id)).length, findOne:async filter=>{ assert.equal(filter.tenantId,'tenant'); return products.find(p=>p._id===filter._id) } },
    '../models/InventoryMaterial':Material,
    '../utils/inventoryMaterials':{ ensureLegacyMaterials:async()=>{} },
    '../models/InventoryEntry':{ create:async row=>{ entries.push(row); return row }, findOne:async filter=>filter._id ? entries.find(row=>row._id===filter._id && row.productId===filter.productId && row.tenantId===filter.tenantId && row.type===filter.type) : entries.find(row=>row.requestId===filter.requestId), find:()=>chain([{ type:'issue',units:2 }]) },
    '../models/Order':{ findOne:async filter=>{ assert.equal(filter.tenantId,'tenant'); return { serviceId:'diabetes' } } },
    '../models/User':{ exists:async()=>true }, '../models/Admin':{ exists:async()=>true },
    '../middleware/adminAuth':()=>{}, '../middleware/staffAuth':()=>{}, '../middleware/checkPermission':()=>()=>{},
    './inventoryDispatches':(_router, addEntry)=>addEntry,
  };
  vm.runInNewContext(source,{ module:{exports:{}}, require:name=>{ if (!(name in mocks)) throw Error(name); return mocks[name] } });
  let sequence=0;
  async function call(path, body, staff=false) {
    const res={ code:200,status(code){this.code=code;return this},json(body){this.body=body;return this} };
    await handlers[path]({ body:{ productId:'material',type:'use',units:1,userId:'user',requestId:`request-number-${++sequence}`, ...body }, params:{}, ...(staff?{staff:{_id:'actor',tenantId:'tenant'}}:{admin:{_id:'actor',tenantId:'tenant'}}) },res);
    return res;
  }
  return {call,material,entries};
}
test('new independent material uses explicit physical quantity, without changing mall stock',async()=>{
  const {call,entries}=setup();
  const res=await call('/materials',{name:'传感器',linkedProductIds:['monitor','diabetes'],openingQuantity:7,openingNote:'实盘'});
  assert.equal(res.code,200); assert.equal(res.body.data.stock,7); assert.equal(entries[0].materialId,'new-material');
  for(const openingQuantity of [undefined,null,'',-1,1.5]) assert.equal((await call('/materials',{name:'传感器',openingQuantity,openingNote:'实盘'})).code,400);
  assert.equal((await call('/materials',{name:'传感器',linkedProductIds:['foreign'],openingQuantity:0,openingNote:'实盘'})).code,400);
});
test('two services consume the same physical stock; a paid order does not bypass delivery deduction',async()=>{
  const {call,material,entries}=setup();
  assert.equal((await call('/entries',{serviceProductId:'monitor',units:2})).code,200);
  assert.equal((await call('/entries',{serviceProductId:'diabetes',orderId:'order'})).code,200);
  assert.equal(material.stock,5); assert.equal(entries[1].quantity,-1); assert.equal(entries[1].sourceOrderId,'order'); assert.equal(entries[1].orderId,undefined);
});
test('using issued supplies and recording service revenue do not deduct physical stock twice',async()=>{
  const {call,material,entries}=setup();
  assert.equal((await call('/entries',{fromIssued:true,assigneeId:'staff',serviceProductId:'diabetes',orderId:'order'})).code,200);
  assert.equal((await call('/entries',{type:'manual_sale',serviceProductId:'diabetes',unitPrice:2000,note:'已收款'},true)).code,200);
  assert.equal(material.stock,8); assert.equal(entries[0].quantity,0); assert.equal(entries[1].quantity,0);
});
test('unlinked services, insufficient stock and repeated requests are rejected',async()=>{
  const {call,material}=setup();
  assert.equal((await call('/entries',{serviceProductId:'foreign'})).code,400);
  assert.equal((await call('/entries',{units:9})).code,409);
  assert.equal((await call('/entries',{requestId:'same-request-123456'})).code,200);
  assert.equal((await call('/entries',{requestId:'same-request-123456'})).code,200);
  assert.equal(material.stock,7);
});

test('legacy migration retains one balance and never overwrites later physical changes',async()=>{
  const utility=fs.readFileSync(require.resolve('../src/utils/inventoryMaterials'),'utf8');
  const store=new Map(); const module={exports:{}};
  vm.runInNewContext(utility,{module,require:name=>name.includes('InventoryMaterial')?{updateOne:async(filter,update)=>{if(!store.has(filter._id))store.set(filter._id,structuredClone(update.$setOnInsert))}}:{}});
  const old={_id:'old',tenantId:'tenant',name:'原服务',stock:8,inventoryTracking:{enabled:true,kind:'consumable'}};
  await module.exports.ensureLegacyMaterial(old);
  store.get('old').stock=7;store.get('old').name='实物传感器';
  await module.exports.ensureLegacyMaterial({...old,stock:1000});
  assert.equal(store.size,1);assert.equal(store.get('old').stock,7);assert.equal(store.get('old').name,'实物传感器');assert.equal(store.get('old').linkedProductIds[0],'old');
});

 test('delivery copies authoritative receipt expiry and rejects wrong or expired batches before stock change', async () => {
  const {call,entries,material}=setup();
  entries.push({_id:'receipt1',tenantId:'tenant',productId:'material',type:'receipt',batchNo:'LOT-A',expiresAt:'2099-04-27'});
  const saved=await call('/entries',{sourceReceiptId:'receipt1',batchNo:'tampered',expiresAt:'2098-01-01'});
  assert.equal(saved.code,200);
  assert.equal(saved.body.data.batchNo,'LOT-A'); assert.equal(saved.body.data.expiresAt,'2099-04-27');
  assert.equal(saved.body.data.sourceReceiptId,'receipt1');
  assert.equal((await call('/entries',{sourceReceiptId:'foreign'})).code,404);
  entries[0].expiresAt='2020-01-01';
  assert.equal((await call('/entries',{sourceReceiptId:'receipt1'})).code,400);
  assert.equal(material.stock,7);
 });
