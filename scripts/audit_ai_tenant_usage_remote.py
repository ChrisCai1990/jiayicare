"""Read-only production audit of AI usage attribution; no prompts or identities."""
import json
from ssh_config import connect

COMMAND = r'''cd /var/www/jiayicare && node <<'NODE'
const fs = require('fs');
const mongoose = require('mongoose');
const env = require('dotenv').parse(fs.readFileSync('backend/.env'));
(async () => {
  await mongoose.connect(env.MONGODB_URI, {autoIndex:false, autoCreate:false});
  const db = mongoose.connection.db;
  const tenants = await db.collection('tenants').find({}, {projection:{code:1}}).toArray();
  const codes = Object.fromEntries(tenants.map(t => [String(t._id),t.code]));
  const now = new Date(Date.now() + 8*3600000).toISOString().slice(0,7);
  const start = new Date(now+'-01T00:00:00+08:00');
  const groups = await db.collection('ai_usage').aggregate([
    {$match:{createdAt:{$gte:start}}},
    {$group:{_id:'$tenantId',calls:{$sum:1},actualTokens:{$sum:{$ifNull:['$actualTokens',0]}},reservedTokens:{$sum:{$ifNull:['$reservedTokens',0]}}}}
  ]).toArray();
  const missing = await db.collection('ai_usage').find({createdAt:{$gte:start},$or:[{tenantId:''},{tenantId:null},{tenantId:{$exists:false}}]}, {projection:{stage:1,business:1,reportId:1,actorId:1,status:1}}).toArray();
  const sources = [];
  for (const row of missing) {
    let reportTenant = '', actorTenant = '';
    if (/^[a-f\d]{24}$/i.test(String(row.reportId||''))) {
      const report = await db.collection('medicalreports').findOne({_id:new mongoose.Types.ObjectId(row.reportId)}, {projection:{tenantId:1}});
      reportTenant = codes[String(report?.tenantId||'')] || '';
    }
    if (/^[a-f\d]{24}$/i.test(String(row.actorId||''))) {
      const id = new mongoose.Types.ObjectId(row.actorId);
      const actor = await db.collection('admins').findOne({_id:id}, {projection:{tenantId:1}}) || await db.collection('users').findOne({_id:id}, {projection:{tenantId:1}});
      actorTenant = codes[String(actor?.tenantId||'')] || '';
    }
    sources.push({stage:row.stage,business:row.business,status:row.status,hasReport:!!row.reportId,hasActor:!!row.actorId,reportTenant:reportTenant||null,actorTenant:actorTenant||null});
  }
  console.log(JSON.stringify({month:now,groups:groups.map(g=>({tenant:codes[String(g._id||'')]||'unattributed',calls:g.calls,actualTokens:g.actualTokens,reservedTokens:g.reservedTokens})),sources}));
  await mongoose.disconnect();
})().catch(e=>{console.error(e.name);process.exitCode=1});
NODE'''

if __name__ == '__main__':
    client = connect()
    try:
        _, stdout, stderr = client.exec_command(COMMAND, timeout=30)
        output, error = stdout.read().decode('utf-8'), stderr.read().decode('utf-8')
        if stdout.channel.recv_exit_status():
            raise RuntimeError('AI attribution audit failed: '+error[:300])
        print(json.dumps(json.loads(output), ensure_ascii=False, indent=2))
    finally:
        client.close()
