// Operator-only Linux maintenance command. Never exposed as a customer endpoint.
require('dotenv').config();
const fs=require('node:fs'),crypto=require('node:crypto');
const mongoose=require('mongoose');
const {readHostState,validateWriters,acquireOfflineFence,assertOfflineFence,resumeStopping,releaseOfflineFence}=require('../src/utils/accountDeletionOfflineFence');
const {configuration}=require('../src/utils/accountDeletionStartupGuard');
async function main(){
 const action=process.argv[2];
 if(!['inspect','acquire','status','resume','release'].includes(action))throw Object.assign(Error(),{code:'MAINTENANCE_ACTION_REQUIRED'});
 const config=configuration();
 if(!config)throw Object.assign(Error(),{code:'MAINTENANCE_NOT_CONFIGURED'});
 const writers=JSON.parse(process.env.ACCOUNT_DELETION_WRITERS||'null');validateWriters(writers);
 const client=new mongoose.mongo.MongoClient(process.env.MONGODB_URI);
 const db=client.db();
 const databaseHash=crypto.createHash('sha256').update(JSON.stringify({hosts:client.options.hosts.map(h=>String(h)).sort(),database:db.databaseName,replicaSet:client.options.replicaSet||''})).digest('hex');
 if(action==='inspect'){
  const state=readHostState(writers,databaseHash);
  console.log(JSON.stringify({databaseHash,...state}));return;
 }
 if(action==='acquire'){
  const lease=acquireOfflineFence({writers,verifiedDatabaseHash:databaseHash});
  console.log(JSON.stringify({held:true,writers:lease.writers.map(w=>w.name)}));return;
 }
 // Recovery token is local root-protected state, never an HTTP input or log output.
 const token=JSON.parse(fs.readFileSync(config.lock,'utf8')).recoveryToken;
 if(action==='resume'){console.log(JSON.stringify(resumeStopping({token})));return;}
 if(action==='status'){
  assertOfflineFence({token});console.log(JSON.stringify({held:true}));return;
 }
 try{
  await client.connect();
  const result=await releaseOfflineFence({token,db,objectId:id=>new mongoose.Types.ObjectId(id)});
  console.log(JSON.stringify(result));
 }finally{await client.close();}
}
main().catch(error=>{console.error(JSON.stringify({error:/^[A-Z_]{3,80}$/.test(error.code||'')?error.code:'MAINTENANCE_COMMAND_FAILED'}));process.exitCode=1;});
