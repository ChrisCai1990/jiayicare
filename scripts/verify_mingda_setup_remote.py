"""Read-only production check of Jia/Mingda setup ownership and customer separation."""
import json
import shlex
from ssh_config import connect

SCRIPT = r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient}=require('mongoose').mongo;
(async()=>{const c=new MongoClient(process.env.MONGODB_URI);try{await c.connect();const db=c.db(),out={};
for(const code of ['jiayihui','mingdahealth']){
 const t=await db.collection('tenants').findOne({code},{projection:{_id:1,status:1,serviceScope:1}});
 if(!t)throw Error(code+' missing');
 const counts={};for(const name of ['admins','users','companyinfos','departments','staffroles','teams'])counts[name]=await db.collection(name).countDocuments({tenantId:t._id});
 out[code]={status:t.status,serviceScope:t.serviceScope||[],counts};
}console.log(JSON.stringify(out));}finally{await c.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

if __name__ == '__main__':
    with connect() as ssh:
        _, out, err = ssh.exec_command('cd /var/www/jiayicare && node -e ' + shlex.quote(SCRIPT), timeout=40)
        data, error = out.read().decode('utf-8'), err.read().decode('utf-8')
        if out.channel.recv_exit_status():
            raise SystemExit(error[:500] or 'Verification failed')
        print(json.dumps(json.loads(data), ensure_ascii=False, indent=2))
