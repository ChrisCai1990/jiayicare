"""Read-only production commission diagnosis; outputs no customer contact details."""
import shlex
from ssh_config import connect

JS = r"""
require('dotenv').config({path:'backend/.env', quiet:true});
const mongoose=require('mongoose');
(async()=>{
await mongoose.connect(process.env.MONGODB_URI);
const db=mongoose.connection.db;
const rows=await db.collection('commissions').aggregate([
{$lookup:{from:'orders',localField:'orderId',foreignField:'_id',as:'orders'}},
{$unwind:{path:'$orders',preserveNullAndEmptyArrays:true}},
{$group:{_id:{commission:'$status',order:'$orders.status',payment:'$orders.paymentStatus',refund:'$orders.refundStatus'},count:{$sum:1}}}
]).toArray();
console.log(JSON.stringify({counts:rows}));
const cs=await db.collection('commissions').find({createdAt:{$gte:new Date('2026-09-06T00:00:00+08:00')}}).sort({createdAt:-1}).limit(60).toArray();
for(const c of cs){
const o=await db.collection('orders').findOne({_id:c.orderId});
if(!o)continue;
const a=await db.collection('admins').findOne({_id:c.staffId},{projection:{name:1}});
const share=await db.collection('productshares').findOne({convertedOrderId:o._id});
const push=await db.collection('pushrecords').findOne({patientId:o.user,type:'product',$or:[{productId:o.serviceId},{'products.productId':o.serviceId}]},{sort:{createdAt:-1}});
console.log(JSON.stringify({commissionId:c._id,orderId:o._id,staff:a?.name,product:o.serviceName,amount:c.commissionAmount,status:c.status,orderStatus:o.status,payment:o.paymentStatus,refund:o.refundStatus,pushRecordId:o.pushRecordId,hasShare:!!share,latestPushAt:push?.createdAt,createdAt:o.createdAt}));
}
await mongoose.disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
"""
with connect() as ssh:
    command = 'cd /var/www/jiayicare && git rev-parse HEAD && node -e ' + shlex.quote(JS)
    _, out, err = ssh.exec_command(command, timeout=60)
    print(out.read().decode('utf-8'))
    print(err.read().decode('utf-8'))
    raise SystemExit(out.channel.recv_exit_status())
