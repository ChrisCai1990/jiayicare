"""Read-only production tenant inventory; prints counts only."""
import json
from ssh_config import connect

COMMAND = r'''cd /var/www/jiayicare && node <<'NODE'
const fs=require('fs');
const mongoose=require('mongoose');
const env=require('dotenv').parse(fs.readFileSync('backend/.env'));
const path=require('path');
const dir=path.resolve('backend/src/models');
for(const file of fs.readdirSync(dir).filter(name=>name.endsWith('.js')))require(path.join(dir,file));
const names=[...new Set(mongoose.modelNames().map(name=>mongoose.model(name)).filter(model=>model.schema.path('tenantId')).map(model=>model.collection.name))].sort();
(async()=>{
  await mongoose.connect(env.MONGODB_URI,{autoIndex:false,autoCreate:false});
  const db=mongoose.connection.db;
  const tenants=await db.collection('tenants').find({}, {projection:{code:1,name:1,status:1}}).toArray();
  const counts={};
  for(const name of names){
    const coll=db.collection(name);
    counts[name]={unassigned:await coll.countDocuments({tenantId:null}),assigned:await coll.countDocuments({tenantId:{$exists:true,$ne:null}})};
  }
  const platformAdmins=await db.collection('admins').countDocuments({role:'platformSuper',tenantId:null});
  console.log(JSON.stringify({tenants,platformAdmins,counts}));
  await mongoose.disconnect();
})().catch(e=>{console.error(e.name);process.exitCode=1});
NODE'''

if __name__ == '__main__':
    client = connect()
    try:
        _, stdout, stderr = client.exec_command(COMMAND, timeout=30)
        output = stdout.read().decode('utf-8')
        error = stderr.read().decode('utf-8')
        if stdout.channel.recv_exit_status():
            raise RuntimeError('Read-only tenant audit failed: ' + error[:500])
        print(json.dumps(json.loads(output), ensure_ascii=False, indent=2))
    finally:
        client.close()
