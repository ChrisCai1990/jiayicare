// Idempotent, explicit catalog publication. Does not alter customers or existing orders.
require('dotenv').config({path:require('path').join(__dirname,'../.env')});
const mongoose=require('mongoose');
const Tenant=require('../src/models/Tenant');
const Product=require('../src/models/Product');
const ProductCategory=require('../src/models/ProductCategory');
const PlanTemplate=require('../src/models/PlanTemplate');
const {DynamicQuestionnaire}=require('../src/models/DynamicQuestionnaire');
const {runWithoutTenantScope}=require('../src/utils/tenantScope');
const {idFor}=require('../src/utils/rehabService');
const catalog=require('../src/utils/rehabCatalog');
async function main(){
  await mongoose.connect(process.env.MONGODB_URI);
  await runWithoutTenantScope(async()=>{
    const tenant=await Tenant.findOne({code:'jiayihui',status:'active'});
    if(!tenant) throw new Error('嘉医汇机构未启用');
    const tenantId=tenant._id;
    const qid=idFor(`rehab-questionnaire:${tenantId}:v1`);
    const days=Number(process.env.REHAB_VALIDITY_DAYS || 365);
    if(!Number.isInteger(days)||days<1)throw new Error('有效期无效');
    const products=catalog.products(qid,days).map((p,i)=>({_id:idFor(`rehab-product:${tenantId}:${i}`),tenantId,...p}));
    const existing=await Product.find({tenantId,$or:[{name:{$in:products.map(p=>p.name)}},{'serviceWorkflow.key':'rehab'}]}).lean();
    if(existing.some(p=>!products.some(x=>String(x._id)===String(p._id))))throw new Error('存在未匹配的运动商品，停止自动创建，请核对');
    console.log(JSON.stringify({apply:process.argv.includes('--apply'),products:products.map(p=>({id:p._id,name:p.name,skus:p.skus})),questionCount:catalog.questions.length,templateCount:catalog.templates.length},null,2));
    if(!process.argv.includes('--apply'))return;
    await DynamicQuestionnaire.updateOne({_id:qid},{$setOnInsert:{title:'运动评估预约前筛查',description:'请在评估前据实填写。运动复健师会结合答卷判断评估准备与运动安排。',questions:catalog.questions,standardTemplateKey:catalog.QUESTIONNAIRE_KEY,targetType:'specific',patientCategory:'adult',status:'active',scoringEnabled:false}},{upsert:true,runValidators:true});
    await ProductCategory.updateOne({tenantId,name:'运动评估与复健'},{$setOnInsert:{sortOrder:25}},{upsert:true,runValidators:true});
    for(const p of products){const {_id,...values}=p;await Product.updateOne({_id},{$setOnInsert:values},{upsert:true,runValidators:true});}
    for(const [i,t] of catalog.templates.entries())await PlanTemplate.updateOne({_id:idFor(`rehab-template:${tenantId}:${i}`)},{$setOnInsert:{tenantId,type:'rehab',status:'active',...t}},{upsert:true,runValidators:true});
    console.log('REHAB_CATALOG_PUBLISHED');
  });
  await mongoose.disconnect();
}
main().catch(async e=>{console.error(e.message);await mongoose.disconnect();process.exitCode=1});
