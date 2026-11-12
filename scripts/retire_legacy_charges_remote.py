"""Archive then remove unreferenced legacy ServiceItem/OtherCharge records."""
import argparse
import base64
import sys
from ssh_config import connect

parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()

JS = r"""
require('dotenv').config({path:'backend/.env',quiet:true});
const fs=require('fs');
const {MongoClient,BSON}=require('mongodb');
(async()=>{
  const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
  try {
    await client.connect();
    const db=client.db();
    const services=await db.collection('serviceitems').find({}).toArray();
    const charges=await db.collection('othercharges').find({}).toArray();
    if(services.length!==15||charges.length!==6) throw Error('Legacy catalog counts changed; stop');
    const serviceIds=services.map(row=>row._id),chargeIds=charges.map(row=>row._id);
    const references={
      serviceOrders:await db.collection('orders').countDocuments({serviceId:{$in:serviceIds.map(String).concat(serviceIds)}}),
      chargeOrders:await db.collection('orders').countDocuments({serviceId:{$in:chargeIds.map(String).concat(chargeIds)}}),
      resources:await db.collection('medicaldeliveryresources').countDocuments({serviceItemId:{$in:serviceIds}}),
      templates:await db.collection('projecttemplates').countDocuments({'items.itemId':{$in:serviceIds.concat(chargeIds)}}),
    };
    if(Object.values(references).some(count=>count!==0)) throw Error('Legacy catalog gained references; stop');
    const result={services:services.length,charges:charges.length,references,applied:APPLY};
    if(APPLY){
      const dir='/var/backups/jiayicare';
      fs.mkdirSync(dir,{recursive:true,mode:0o700});
      const backup=`${dir}/legacy-charge-catalog-20261112-${Date.now()}.json`;
      fs.writeFileSync(backup,BSON.EJSON.stringify({auditedAt:new Date(),services,charges}),{flag:'wx',mode:0o600});
      result.backup=backup;
      result.removedServices=(await db.collection('serviceitems').deleteMany({_id:{$in:serviceIds}})).deletedCount;
      result.removedCharges=(await db.collection('othercharges').deleteMany({_id:{$in:chargeIds}})).deletedCount;
      result.remainingServices=await db.collection('serviceitems').countDocuments({});
      result.remainingCharges=await db.collection('othercharges').countDocuments({});
      if(result.removedServices!==15||result.removedCharges!==6||result.remainingServices||result.remainingCharges)
        throw Error('Unexpected deletion result; inspect backup '+backup);
    }
    console.log(Buffer.from(JSON.stringify(result),'utf8').toString('base64'));
  }finally{await client.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1});
""".replace('APPLY', 'true' if args.apply else 'false')

with connect() as ssh:
    sys.stdout.reconfigure(encoding='utf-8')
    encoded = base64.b64encode(JS.encode()).decode()
    command = f"cd /var/www/jiayicare && node -e \"eval(Buffer.from('{encoded}','base64').toString())\""
    _, stdout, stderr = ssh.exec_command(command, timeout=30)
    output = stdout.read().decode().strip()
    error = stderr.read().decode().strip()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error or 'Remote cleanup failed')
    print(base64.b64decode(output).decode('utf-8'))
