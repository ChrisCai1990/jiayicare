"""One-record audited backfill for Jiayihui website assistant AI usage."""
import argparse
import json
from ssh_config import connect

SCRIPT = r'''
const fs=require('fs'),mongoose=require('mongoose');
const env=require('dotenv').parse(fs.readFileSync('backend/.env'));
const apply=__APPLY__;
(async()=>{
 await mongoose.connect(env.MONGODB_URI,{autoIndex:false,autoCreate:false});
 const db=mongoose.connection.db;
 const tenants=await db.collection('tenants').find({},{projection:{code:1}}).toArray();
 if(tenants.length!==1||tenants[0].code!=='jiayihui') throw new Error('single Jiayihui tenant precondition failed');
 const tenantId=String(tenants[0]._id);
 const match={createdAt:new Date('2026-09-30T16:10:08.593Z'),provider:'qwen',model:'qwen-plus',business:'other',stage:'request',status:'success',reservedTokens:2726,actualTokens:656,actorId:'',reportId:''};
 const rows=await db.collection('ai_usage').find(match,{projection:{_id:1,tenantId:1}}).toArray();
 if(rows.length!==1) throw new Error('exact usage record not unique');
 const row=rows[0];
 const current=String(row.tenantId||'');
 if(current&&current!==tenantId) throw new Error('usage already belongs to another tenant');
 let backup=null,changed=0;
 if(apply&&!current){
   const stamp=new Date().toISOString().replace(/[:.]/g,'-');
   backup='/var/backups/jiayicare/ai-usage-visitor-attribution-'+stamp+'.json';
   fs.mkdirSync('/var/backups/jiayicare',{recursive:true,mode:0o700});
   fs.writeFileSync(backup,JSON.stringify({id:String(row._id),originalTenantId:row.tenantId??null,reason:'Jiayihui public website visitor assistant; sole institution at call time; actorless maxTokens 280 call'}),{mode:0o600,flag:'wx'});
   const result=await db.collection('ai_usage').updateOne({_id:row._id,$or:[{tenantId:''},{tenantId:null},{tenantId:{$exists:false}}]},{$set:{tenantId}});
   changed=result.modifiedCount;
   if(changed!==1) throw new Error('concurrent change; inspect backup and record');
   await db.collection('ai_control_audit').insertOne({_id:'visitor-ai-attribution-'+String(row._id),action:'attribution_backfill',at:new Date(),tenantId,usageId:String(row._id),reason:'Jiayihui public website assistant; sole institution; actorless call'});
 }
 console.log(JSON.stringify({matched:rows.length,alreadyAttributed:current===tenantId,changed,backup}));
 await mongoose.disconnect();
})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    client=connect()
    try:
        stdin,stdout,stderr=client.exec_command('cd /var/www/jiayicare && node',timeout=45)
        stdin.write(SCRIPT.replace('__APPLY__','true' if args.apply else 'false'))
        stdin.channel.shutdown_write()
        output,error=stdout.read().decode('utf-8'),stderr.read().decode('utf-8')
        if stdout.channel.recv_exit_status(): raise RuntimeError('Visitor AI attribution failed: '+error[:300])
        print(json.dumps(json.loads(output),ensure_ascii=False,indent=2))
    finally: client.close()

if __name__=='__main__': main()
