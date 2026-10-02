"""Guarded correction: Mingda has no configured service yet."""
import json
import shlex
from ssh_config import connect

SCRIPT = r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient}=require('mongoose').mongo;
(async()=>{
  const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
  try {
    await client.connect();
    const tenants=client.db().collection('tenants');
    const query={code:'mingdahealth',status:'suspended'};
    const before=await tenants.findOne(query,{projection:{name:1,serviceScope:1,status:1,websiteHosts:1}});
    if(!before || before.name!=='明大健康' || (before.websiteHosts||[]).length) throw new Error('Mingda precondition mismatch');
    const old=JSON.stringify(before.serviceScope||[]);
    if(old!==JSON.stringify(['admin','staff','customer']) && old!==JSON.stringify(['admin','staff']) && old!==JSON.stringify([])) throw new Error('Unexpected scope');
    if(old!==JSON.stringify([])) {
      const result=await tenants.updateOne({...query,_id:before._id,serviceScope:before.serviceScope},{$set:{serviceScope:[],serviceScopeNote:'嘉静佑辰尚未完成本机构各端配置与隔离验收；现有客户小程序仅属嘉医汇'}});
      if(result.modifiedCount!==1) throw new Error('Concurrent update or no modification');
    }
    const after=await tenants.findOne(query,{projection:{code:1,status:1,serviceScope:1,serviceScopeNote:1}});
    console.log(JSON.stringify({code:after.code,status:after.status,serviceScope:after.serviceScope,hasScopeNote:!!after.serviceScopeNote}));
  } finally {await client.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

if __name__ == '__main__':
    command = 'cd /var/www/jiayicare && node -e ' + shlex.quote(SCRIPT)
    with connect() as ssh:
        _, stdout, stderr = ssh.exec_command(command, timeout=30)
        out, err = stdout.read().decode('utf-8'), stderr.read().decode('utf-8')
        if stdout.channel.recv_exit_status():
            raise SystemExit(err[:500] or 'Mingda correction failed')
        print(json.dumps(json.loads(out), ensure_ascii=False))
