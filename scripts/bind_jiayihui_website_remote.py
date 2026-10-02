"""Bind the existing Jiayihui website before switching to host-based ownership."""
import argparse
import json
from ssh_config import connect

SCRIPT = r'''
const fs=require('fs'),mongoose=require('mongoose');
const env=require('dotenv').parse(fs.readFileSync('backend/.env'));
const apply=__APPLY__, hosts=['jiaycare.com','www.jiaycare.com'];
(async()=>{
 await mongoose.connect(env.MONGODB_URI,{autoIndex:false,autoCreate:false});
 const db=mongoose.connection.db, coll=db.collection('tenants');
 const tenants=await coll.find({},{projection:{code:1,websiteHosts:1}}).toArray();
 if(tenants.length!==1||tenants[0].code!=='jiayihui') throw new Error('single Jiayihui tenant precondition failed');
 const tenant=tenants[0], existing=tenant.websiteHosts||[];
 if(existing.length&&!hosts.every(host=>existing.includes(host))) throw new Error('unexpected existing website binding');
 let backup=null, changed=0;
 if(apply){
   const stamp=new Date().toISOString().replace(/[:.]/g,'-');
   backup='/var/backups/jiayicare/website-binding-'+stamp+'.json';
   fs.mkdirSync('/var/backups/jiayicare',{recursive:true,mode:0o700});
   fs.writeFileSync(backup,JSON.stringify({tenantId:String(tenant._id),originalWebsiteHosts:existing}),{mode:0o600,flag:'wx'});
   await coll.createIndex({websiteHosts:1},{unique:true,sparse:true});
   if(!existing.length){
     const result=await coll.updateOne({_id:tenant._id,$or:[{websiteHosts:{$exists:false}},{websiteHosts:{$size:0}}]},{$set:{websiteHosts:hosts,updatedAt:new Date()}});
     changed=result.modifiedCount;
     if(changed!==1) throw new Error('concurrent website binding change');
   }
 }
 console.log(JSON.stringify({tenant:tenant.code,hosts,alreadyBound:hosts.every(host=>existing.includes(host)),changed,backup}));
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
        if stdout.channel.recv_exit_status(): raise RuntimeError('Website binding failed: '+error[:300])
        print(json.dumps(json.loads(output),ensure_ascii=False,indent=2))
    finally: client.close()

if __name__=='__main__': main()
