"""Read-only counts and index audit for institution-owned settings."""
import json
import shlex
from ssh_config import connect

SCRIPT = r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient}=require('mongoose').mongo;
(async()=>{const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});try{
 await client.connect();const db=client.db();const names=['companyinfos','departments','staffroles'];const result={};
 for(const name of names){const c=db.collection(name),indexes=await c.listIndexes().toArray();result[name]={total:await c.countDocuments({}),unassigned:await c.countDocuments({$or:[{tenantId:null},{tenantId:{$exists:false}}]}),indexes:indexes.map(i=>({key:i.key,unique:!!i.unique}))};}
 console.log(JSON.stringify(result));
}finally{await client.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

if __name__ == '__main__':
    with connect() as ssh:
        _, out, err = ssh.exec_command('cd /var/www/jiayicare && node -e ' + shlex.quote(SCRIPT), timeout=30)
        data, error = out.read().decode('utf-8'), err.read().decode('utf-8')
        if out.channel.recv_exit_status():
            raise SystemExit(error[:500] or 'Settings audit failed')
        print(json.dumps(json.loads(data), ensure_ascii=False, indent=2))
