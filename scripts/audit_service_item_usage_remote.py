"""Read-only count of legacy service-item records and known references."""
import base64
import sys
from ssh_config import connect

JS = r"""
require('dotenv').config({path:'backend/.env', quiet:true});
const {MongoClient}=require('mongodb');
(async()=>{
  const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
  try {
    await client.connect();
    const db=client.db();
    const items=await db.collection('serviceitems').find({},
      {projection:{_id:1,tenantId:1,name:1,retailPrice:1,status:1}}).toArray();
    const charges=await db.collection('othercharges').find({},
      {projection:{_id:1,tenantId:1,name:1,retailPrice:1,status:1}}).toArray();
    const ids=items.map(x=>x._id);
    const chargeIds=charges.map(x=>x._id);
    const refs=ids.length ? await Promise.all([
      db.collection('medicaldeliveryresources').countDocuments({serviceItemId:{$in:ids}}),
      db.collection('orders').countDocuments({serviceId:{$in:ids.map(String)}}),
      db.collection('orders').countDocuments({serviceId:{$in:ids}}),
    ]) : [0,0,0];
    const templateRefs=await Promise.all([
      db.collection('projecttemplates').countDocuments({'items':{$elemMatch:{itemType:'serviceItem',itemId:{$in:ids}}}}),
      db.collection('projecttemplates').countDocuments({'items':{$elemMatch:{itemType:'otherCharge',itemId:{$in:chargeIds}}}}),
    ]);
    const chargeOrderRefs=chargeIds.length ? await Promise.all([
      db.collection('orders').countDocuments({serviceId:{$in:chargeIds.map(String)}}),
      db.collection('orders').countDocuments({serviceId:{$in:chargeIds}}),
    ]) : [0,0];
    const products=await db.collection('products').find({},
      {projection:{_id:1,tenantId:1,name:1,originalPrice:1,paymentChannel:1,status:1}}).toArray();
    const names=new Map();
    for(const p of products){const key=`${p.tenantId}:${p.name}`;names.set(key,[...(names.get(key)||[]),p]);}
    const comparisons=items.map(s=>({id:String(s._id),name:s.name,price:s.retailPrice,
      status:s.status,exactNameProducts:(names.get(`${s.tenantId}:${s.name}`)||[]).map(p=>({
        id:String(p._id),price:p.originalPrice,channel:p.paymentChannel,status:p.status}))}));
    const chargeComparisons=charges.map(s=>({id:String(s._id),name:s.name,price:s.retailPrice,
      status:s.status,exactNameProducts:(names.get(`${s.tenantId}:${s.name}`)||[]).map(p=>({
        id:String(p._id),price:p.originalPrice,channel:p.paymentChannel,status:p.status}))}));
    console.log(Buffer.from(JSON.stringify({serviceItemCount:items.length,resourceReferences:refs[0],
      orderStringReferences:refs[1],orderObjectIdReferences:refs[2],
      serviceTemplateReferences:templateRefs[0],otherChargeCount:charges.length,
      otherChargeTemplateReferences:templateRefs[1],otherChargeOrderStringReferences:chargeOrderRefs[0],
      otherChargeOrderObjectIdReferences:chargeOrderRefs[1],chargeComparisons,
      productCount:products.length,productChannels:products.reduce((a,p)=>(a[p.paymentChannel||'wechat_pay']=(a[p.paymentChannel||'wechat_pay']||0)+1,a),{}),
      comparisons}),'utf8').toString('base64'));
  } finally {await client.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
"""

with connect() as ssh:
    sys.stdout.reconfigure(encoding='utf-8')
    encoded = base64.b64encode(JS.encode()).decode()
    command = f"cd /var/www/jiayicare && node -e \"eval(Buffer.from('{encoded}','base64').toString())\""
    _, stdout, stderr = ssh.exec_command(command, timeout=30)
    output = stdout.read().decode().strip()
    print(base64.b64decode(output).decode('utf-8'))
    error = stderr.read().decode()
    if error:
        raise RuntimeError(error)
    if stdout.channel.recv_exit_status():
        raise RuntimeError("Remote audit failed")
