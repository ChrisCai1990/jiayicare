"""Prepare Mingda's Admin and Staff channel plan without opening customer access."""
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
    const db=client.db(), tenants=db.collection('tenants');
    const tenant=await tenants.findOne({code:'mingdahealth'}, {projection:{name:1,legalName:1,status:1,websiteHosts:1,serviceScope:1,staffPortalName:1,commercialPlan:1}});
    if(!tenant || tenant.name!=='明大健康' || tenant.legalName!=='浙江明大健康管理有限公司' || tenant.status!=='suspended' || tenant.commercialPlan!=='standard') throw new Error('Mingda identity or status changed');
    if((tenant.websiteHosts||[]).length) throw new Error('Mingda already has website hosts');
    const [admins,users]=await Promise.all(['admins','users'].map(name=>db.collection(name).countDocuments({tenantId:tenant._id})));
    if(admins||users) throw new Error('Mingda already has accounts or customers');
    const current=JSON.stringify(tenant.serviceScope||[]), intended=JSON.stringify(['admin','staff']);
    if(current!==JSON.stringify([]) && current!==intended) throw new Error('Unexpected service scope');
    if(current!==intended || tenant.staffPortalName!=='明大健康') {
      const before={serviceScope:tenant.serviceScope||[],staffPortalName:tenant.staffPortalName||''};
      const result=await tenants.updateOne({_id:tenant._id,code:'mingdahealth',status:'suspended',serviceScope:tenant.serviceScope||[]},{$set:{serviceScope:['admin','staff'],staffPortalName:'明大健康',serviceScopeNote:'机构后台和医护端拟接入；尚未开通账号及客户业务。客户小程序另行上线，AI尚未选用。'}});
      if(result.modifiedCount!==1) throw new Error('Concurrent change; no update applied');
      await db.collection('platform_access_audits').insertOne({tenantId:tenant._id,actorType:'codex_assistant',actorId:null,action:'prepare_tenant_channels',before,after:{serviceScope:['admin','staff'],staffPortalName:'明大健康'},reason:'用户要求先配置明大管理后台与医护端，小程序后续单独上线',at:new Date()});
    }
    const after=await tenants.findOne({_id:tenant._id},{projection:{code:1,status:1,serviceScope:1,staffPortalName:1,websiteHosts:1}});
    console.log(JSON.stringify({code:after.code,status:after.status,channels:after.serviceScope,staffPortalNameCodePoints:[...(after.staffPortalName||'')].map(x=>x.codePointAt(0).toString(16)),websiteHostCount:(after.websiteHosts||[]).length,adminCount:admins,customerCount:users}));
  }finally{await client.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

if __name__ == '__main__':
    command = 'cd /var/www/jiayicare && node -e ' + shlex.quote(SCRIPT)
    with connect() as ssh:
        _, stdout, stderr = ssh.exec_command(command, timeout=30)
        out, err = stdout.read().decode('utf-8'), stderr.read().decode('utf-8')
        if stdout.channel.recv_exit_status():
            raise SystemExit(err[:500] or 'Mingda setup failed')
        print(json.dumps(json.loads(out), ensure_ascii=False))
