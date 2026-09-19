"""Read-only production metadata check. No model initialization, writes or customer data."""
import shlex
from ssh_config import connect

JS = r"""
require('dotenv').config({path:'backend/.env', quiet:true});
const {MongoClient} = require('mongoose').mongo;
(async()=>{
  const client = new MongoClient(process.env.MONGODB_URI, {serverSelectionTimeoutMS:10000});
  try {
    await client.connect();
    const db = client.db();
    const hello = await db.admin().command({hello:1});
    const build = await db.admin().command({buildInfo:1});
    const topology = hello.msg === 'isdbgrid' ? 'sharded' : hello.setName ? 'replica_set' : 'standalone';
    const indexes = {};
    for (const name of ['annualserviceperiods','followups','tasks','medications','supplements','recurringsupplyplans','phaseassessments','professionalhealthassessments','followupservicelinks','servicerecords']) {
      try { indexes[name] = (await db.collection(name).listIndexes().toArray()).map(i=>({key:i.key,unique:i.unique===true,sparse:i.sparse===true,partial:i.partialFilterExpression||null})); }
      catch(error) { if(error.code===26) indexes[name]=null; else throw error; }
    }
    console.log(JSON.stringify({checkedAt:new Date().toISOString(),mongoVersion:build.version,topology,transactionTopologyEligible:topology!=='standalone',logicalSessions:hello.logicalSessionTimeoutMinutes!=null,phaseSchedulerConfigured:process.env.ENABLE_PHASE_ASSESSMENT_SCHEDULER==='true',indexes}));
  } finally { await client.close(); }
})().catch(error=>{console.error(JSON.stringify({error:'readiness_check_failed',code:error.code||error.name}));process.exitCode=1;});
"""

def main():
    with connect() as ssh:
        command = 'cd /var/www/jiayicare && git rev-parse HEAD && node -e ' + shlex.quote(JS)
        _, out, err = ssh.exec_command(command, timeout=45)
        print(out.read().decode('utf-8'))
        error = err.read().decode('utf-8')
        if error:
            # Do not expose URI/environment details from unexpected runtime errors.
            print('Remote stderr present; inspect securely if the check failed.')
        return out.channel.recv_exit_status()

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f'Read-only check failed: {type(error).__name__}')
        raise SystemExit(1)
