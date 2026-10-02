"""Backfill current-month AI usage only when its actor proves Jiayihui ownership."""
import argparse
import json
from ssh_config import connect

SCRIPT = r'''
const fs = require('fs');
const mongoose = require('mongoose');
const env = require('dotenv').parse(fs.readFileSync('backend/.env'));
const apply = __APPLY__;
(async () => {
  await mongoose.connect(env.MONGODB_URI, {autoIndex:false, autoCreate:false});
  const db = mongoose.connection.db;
  const tenants = await db.collection('tenants').find({}, {projection:{code:1}}).toArray();
  if (tenants.length !== 1 || tenants[0].code !== 'jiayihui') throw new Error('single Jiayihui tenant precondition failed');
  const tenantId = tenants[0]._id;
  const month = new Date(Date.now()+8*3600000).toISOString().slice(0,7);
  const start = new Date(month+'-01T00:00:00+08:00');
  const filter = {createdAt:{$gte:start},$or:[{tenantId:''},{tenantId:null},{tenantId:{$exists:false}}]};
  const rows = await db.collection('ai_usage').find(filter,{projection:{_id:1,tenantId:1,actorId:1}}).toArray();
  const proven = [];
  for (const row of rows) {
    if (!/^[a-f\d]{24}$/i.test(String(row.actorId||''))) continue;
    const id = new mongoose.Types.ObjectId(row.actorId);
    const actor = await db.collection('admins').findOne({_id:id},{projection:{tenantId:1}})
      || await db.collection('users').findOne({_id:id},{projection:{tenantId:1}});
    if (String(actor?.tenantId||'') === String(tenantId)) proven.push(row);
  }
  let backup = null, changed = 0;
  if (apply && proven.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    backup = '/var/backups/jiayicare/ai-usage-attribution-'+stamp+'.json';
    fs.mkdirSync('/var/backups/jiayicare',{recursive:true,mode:0o700});
    fs.writeFileSync(backup,JSON.stringify(proven.map(row=>({id:String(row._id),hadTenantId:Object.hasOwn(row,'tenantId'),tenantId:row.tenantId??null}))),{mode:0o600,flag:'wx'});
    for (const row of proven) {
      const result = await db.collection('ai_usage').updateOne({_id:row._id,$or:[{tenantId:''},{tenantId:null},{tenantId:{$exists:false}}]},{$set:{tenantId:String(tenantId)}});
      changed += result.modifiedCount;
    }
  }
  console.log(JSON.stringify({month,unattributedBefore:rows.length,proven:proven.length,remaining:rows.length-changed,changed,backup}));
  await mongoose.disconnect();
})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    client = connect()
    try:
        stdin, stdout, stderr = client.exec_command('cd /var/www/jiayicare && node', timeout=45)
        stdin.write(SCRIPT.replace('__APPLY__', 'true' if args.apply else 'false'))
        stdin.channel.shutdown_write()
        output, error = stdout.read().decode('utf-8'), stderr.read().decode('utf-8')
        if stdout.channel.recv_exit_status():
            raise RuntimeError('AI attribution backfill failed: '+error[:300])
        print(json.dumps(json.loads(output), ensure_ascii=False, indent=2))
    finally:
        client.close()

if __name__ == '__main__':
    main()
