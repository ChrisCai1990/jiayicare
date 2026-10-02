"""Guarded backup and Jia ownership migration for institution settings."""
import argparse
import json
import shlex
from ssh_config import connect

SCRIPT = r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient}=require('mongoose').mongo;
const apply=__APPLY__;
const names=['companyinfos','departments','staffroles'];
(async()=>{const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});try{
 await client.connect();const db=client.db();
 const jia=await db.collection('tenants').findOne({code:'jiayihui'},{projection:{_id:1}});
 const mingda=await db.collection('tenants').findOne({code:'mingdahealth'},{projection:{_id:1,status:1}});
 if(!jia||!mingda||mingda.status!=='suspended')throw new Error('Tenant precondition failed');
 const state={};
 for(const name of names){
  const c=db.collection(name),rows=await c.find({}).toArray(),indexes=await c.listIndexes().toArray();
  if(rows.some(r=>r.tenantId&&String(r.tenantId)!==String(jia._id)))throw new Error(name+' contains another tenant');
  if(name==='companyinfos'&&rows.length!==1)throw new Error('Unexpected company info count');
  if(!rows.length)throw new Error(name+' is empty; inspect before migration');
  const backup='tenant_settings_backup_20261002_'+name;
  if(apply){
   const backupExists=await db.listCollections({name:backup}).hasNext();
   if(!backupExists){await db.createCollection(backup);await db.collection(backup).insertMany(rows)}
   const saved=await db.collection(backup).find({},{projection:{_id:1}}).toArray();
   if(saved.length!==rows.length||saved.map(r=>String(r._id)).sort().join(',')!==rows.map(r=>String(r._id)).sort().join(','))throw new Error(backup+' identity mismatch');
   const unassigned={$or:[{tenantId:null},{tenantId:{$exists:false}}]};
   await c.updateMany(unassigned,{$set:{tenantId:jia._id}});
   if(await c.countDocuments({tenantId:jia._id})!==rows.length)throw new Error(name+' ownership count mismatch');
   if(name==='companyinfos')await c.createIndex({tenantId:1},{unique:true,name:'tenantId_1_unique'});
   else{
    await c.createIndex({tenantId:1,name:1},{unique:true,name:'tenantId_1_name_1_unique'});
    if(indexes.some(i=>i.name==='name_1'&&i.unique))await c.dropIndex('name_1');
   }
  }
  state[name]={count:rows.length,unassigned:await c.countDocuments({$or:[{tenantId:null},{tenantId:{$exists:false}}]}),backup:apply?backup:null};
 }
 console.log(JSON.stringify({mode:apply?'apply':'check',jiaId:String(jia._id),mingdaStatus:mingda.status,collections:state}));
}finally{await client.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['check', 'apply'])
    args = parser.parse_args()
    script = SCRIPT.replace('__APPLY__', 'true' if args.phase == 'apply' else 'false')
    with connect() as ssh:
        _, out, err = ssh.exec_command('cd /var/www/jiayicare && node -e ' + shlex.quote(script), timeout=90)
        data, error = out.read().decode('utf-8'), err.read().decode('utf-8')
        if out.channel.recv_exit_status():
            raise SystemExit(error[:500] or 'Settings migration failed')
        print(json.dumps(json.loads(data), ensure_ascii=False, indent=2))
