"""Read-only aggregate evidence for the approved synthetic browser session."""
import json, sys
from pathlib import Path
from ssh_config import connect
ROOT = Path(__file__).resolve().parents[1]
NODE = r'''
const mongoose=require('mongoose');
(async()=>{
 require('./src/utils/reviewEnvironment').assertReviewEnvironment();
 await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false});
 require('./src/utils/reviewEnvironment').assertReviewConnection(mongoose.connection);
 const ledger=await mongoose.connection.collection('reviewservicebudgets').findOne({_id:'external-services'});
 const Message=require('./src/models/Message');
 const marker=await Message.collection.findOne({content:'合成验收A：你好，这条只测试拒绝AI授权后的消息保存。'});
 const result={reservedFen:ledger?.reservedFen||0,textAI:process.env.REVIEW_AI_ENABLED==='true',asr:process.env.REVIEW_ASR_ENABLED==='true',limitFen:Number(process.env.REVIEW_TOTAL_BUDGET_FEN),syntheticSessionFound:!!marker};
 if(marker){
   const rows=await Message.collection.find({user:marker.user}).project({_id:0,content:1,isAI:1,references:1,createdAt:1,role:1}).toArray();
   result.syntheticMessages=rows.filter(x=>x.isAI||String(x.content).startsWith('合成验收'));
   const Consent=require('./src/models/AiDataConsent');
   result.syntheticConsent=await Consent.collection.find({user:marker.user}).project({_id:0,purpose:1,granted:1,revision:1}).toArray();
 }
 console.log(JSON.stringify(result));await mongoose.disconnect();
})().catch(()=>{console.error('Read-only review evidence failed');process.exitCode=1;});
'''
REMOTE = r'''
import pathlib,subprocess
pid=subprocess.check_output(['systemctl','show','jiayicare-review-api','--property=MainPID','--value'],text=True).strip()
env=dict(x.split('=',1) for x in pathlib.Path('/proc/'+pid+'/environ').read_text().split('\0') if '=' in x)
assert env['REVIEW_ENVIRONMENT']=='isolated'
p=subprocess.run(['node','-e',NODE],cwd='/var/www/jiayicare-review/backend',env=env,capture_output=True,text=True,timeout=30)
assert p.returncode==0,'Review evidence read failed'
print(p.stdout)
'''
label=sys.argv[1] if len(sys.argv)>1 else 'current'
assert label.replace('-','').isalnum()
with connect() as c:
    stdin,stdout,stderr=c.exec_command('python3 -',timeout=45)
    stdin.write(REMOTE.replace('NODE',repr(NODE)));stdin.channel.shutdown_write()
    out=stdout.read().decode()
    if stdout.channel.recv_exit_status():raise RuntimeError('Review evidence read failed')
    result=json.loads(out)
    (ROOT/'release/apple-review-20261018'/('browser-'+label+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
