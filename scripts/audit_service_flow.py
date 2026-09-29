"""Read-only production baseline; emit only versions, flags and aggregate counts."""
import json
from ssh_config import connect

COMMAND = r'''cd /var/www/jiayicare && node <<'NODE'
const fs=require('fs'),cp=require('child_process');
const env=require('dotenv').parse(fs.readFileSync('backend/.env'));
const processes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const app=processes.find(p=>p.name==='jiayicare-backend');
const inherited=Object.fromEntries(fs.readFileSync('/proc/'+app.pid+'/environ','utf8').split('\0').filter(Boolean).map(s=>{const at=s.indexOf('=');return [s.slice(0,at),s.slice(at+1)];}));
const effective={...env,...inherited};
const keys=['HEALTH_MANAGEMENT_ROLLOUT_MODE','CHECKUP_PREPARATION_AUTO_ENABLED','ENABLE_PHASE_ASSESSMENT_SCHEDULER','HEALTH_MANAGEMENT_RECOVERY_ENABLED','STARTUP_SCHEMA_WRITES_ENABLED'];
const out={commit:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:app?.pm2_env?.status,flags:Object.fromEntries(keys.map(k=>[k,effective[k]??'unset'])),patientAllowlistCount:String(effective.HEALTH_MANAGEMENT_PATIENT_IDS||'').split(',').filter(Boolean).length,assets:{}};
for(const dir of ['staff','admin','app']){const p=dir+'/dist/index.html';out.assets[dir]=fs.existsSync(p)?require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;}
const mongoose=require('mongoose');
(async()=>{await mongoose.connect(env.MONGODB_URI,{autoIndex:false,autoCreate:false});
for(const collection of ['admins','visitorleads'])out[collection]=await mongoose.connection.db.collection(collection).aggregate([{$group:{_id:{$cond:[{$ifNull:['$tenantId',false]},'tenant_assigned','legacy_unassigned']},count:{$sum:1}}}]).toArray();
console.log(JSON.stringify(out));await mongoose.disconnect();})().catch(e=>{console.error(e.name);process.exitCode=1;});
NODE'''

if __name__ == '__main__':
    client = connect()
    try:
        _, stdout, stderr = client.exec_command(COMMAND, timeout=30)
        output = stdout.read().decode('utf-8')
        error = stderr.read().decode('utf-8')
        if stdout.channel.recv_exit_status():
            raise RuntimeError('Read-only audit failed: ' + error[:500])
        print(json.dumps(json.loads(output), ensure_ascii=True, indent=2))
    finally:
        client.close()
