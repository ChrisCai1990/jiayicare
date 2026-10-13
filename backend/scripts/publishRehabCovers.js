// New artwork only. Dry run by default; preserve any independently edited image.
require('dotenv').config({path:require('path').join(__dirname,'../.env')});
const fs=require('fs');
const path=require('path');
const mongoose=require('mongoose');
const Product=require('../src/models/Product');
const Tenant=require('../src/models/Tenant');
const {uploadBuffer}=require('../src/utils/oss');
const folder='products/rehab-covers-20261014';
const definitions=[
 ['5b61fc51afe5b58085f71c35','首次运动能力评估','assessment'],
 ['39c24a79690e4a97265ff338','运动指导与复健训练','training'],
];
async function main(){
 await mongoose.connect(process.env.MONGODB_URI);
 const tenant=await Tenant.findOne({code:'jiayihui'}).lean();
 if(!tenant)throw new Error('机构不存在');
 const products=[];
 for(const [id,name,kind] of definitions){
  const p=await Product.findOne({_id:id,tenantId:tenant._id,name}).lean();
  if(!p)throw new Error('商品不存在：'+name);
  if(p.images?.length && !p.images[0].includes(folder))throw new Error('商品已有独立配置图片，停止覆盖：'+name);
  const buffer=fs.readFileSync(path.join(__dirname,`../../assets/mall/rehab-${kind}-20261014.jpg`));
  products.push({p,buffer});
 }
 console.log(JSON.stringify({apply:process.argv.includes('--apply'),products:products.map(({p,buffer})=>({name:p.name,bytes:buffer.length,alreadyPublished:!!p.images?.length}))}));
 if(!process.argv.includes('--apply'))return;
 const backupDir=path.join(__dirname,'../../backups');fs.mkdirSync(backupDir,{recursive:true});
 const changes=[];
 for(const {p,buffer} of products){
  if(p.images?.length)continue;
  const uploaded=await uploadBuffer(buffer,'image/jpeg',folder);
  const url=typeof uploaded==='string'?uploaded:uploaded.url;
  if(!url?.startsWith('https://'))throw new Error('上传没有返回有效HTTPS地址');
  changes.push({id:p._id,name:p.name,before:p.images||[],after:[url]});
 }
 fs.writeFileSync(path.join(backupDir,`rehab-covers-${Date.now()}.json`),JSON.stringify(changes,null,2));
 for(const change of changes){
  const r=await Product.updateOne({_id:change.id,tenantId:tenant._id,images:change.before},{$set:{images:change.after}});
  if(r.modifiedCount!==1)throw new Error('图片已被其他人调整，停止覆盖：'+change.name);
 }
 console.log(JSON.stringify({published:changes.map(c=>({name:c.name,url:c.after[0]}))}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>mongoose.disconnect());
