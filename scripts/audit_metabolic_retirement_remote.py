"""Read-only production audit before retiring the standalone metabolic pilot."""
import json
import shlex

from ssh_config import connect


SCRIPT = r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient}=require('mongoose').mongo;
(async()=>{const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});try{
  await client.connect();const db=client.db();
  const pilots=await db.collection('metabolicpilots').aggregate([{$group:{_id:{tenantId:'$tenantId',status:'$status',helpStatus:'$help.status'},count:{$sum:1}}}]).toArray();
  const settings=await db.collection('systemconfigs').find({key:/^metabolic-pilot:/}).project({key:1,'value.enabled':1,'value.accepting':1}).toArray();
  console.log(JSON.stringify({pilots,settings}));
}finally{await client.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
'''


if __name__ == '__main__':
    with connect() as ssh:
        _, out, err = ssh.exec_command('cd /var/www/jiayicare && node -e ' + shlex.quote(SCRIPT), timeout=30)
        data, error = out.read().decode('utf-8'), err.read().decode('utf-8')
        if out.channel.recv_exit_status():
            raise SystemExit(error[:500] or 'Metabolic pilot audit failed')
        print(json.dumps(json.loads(data), ensure_ascii=False, indent=2, default=str))
