"""Read-only production inventory of consultation products and linked orders."""
import shlex
import sys
from ssh_config import connect

sys.stdout.reconfigure(encoding='utf-8')

SCRIPT = r'''
require('dotenv').config({path:'backend/.env'});
const mongoose=require('mongoose');
(async()=>{
  await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});
  const db=mongoose.connection.db;
  const products=await db.collection('products').find({name:{$regex:'健康咨询服务|全专联合会诊|全专联合远程会诊'}})
    .project({name:1,subtitle:1,description:1,features:1,originalPrice:1,servicePrices:1,memberPrices:1,status:1,fulfillmentType:1,serviceProvider:1,bookingRequired:1,serviceLocation:1,serviceWorkflow:1,tenantId:1}).toArray();
  const out=[];
  for(const p of products){
    const orders=await db.collection('orders').aggregate([{$match:{serviceId:String(p._id)}},{$group:{_id:{paymentStatus:'$paymentStatus',status:'$status',specificationLabel:'$specificationLabel',servicePrice:'$servicePrice'},count:{$sum:1}}}]).toArray();
    out.push({...p,_id:String(p._id),tenantId:String(p.tenantId||''),orders});
  }
  console.log(JSON.stringify(out));
  await mongoose.disconnect();
})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

with connect() as ssh:
    _, stdout, stderr = ssh.exec_command('cd /var/www/jiayicare && node -e ' + shlex.quote(SCRIPT), timeout=45)
    output = stdout.read().decode()
    error = stderr.read().decode()
    if error:
        raise SystemExit(error)
    print(output)
