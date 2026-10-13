import shlex
from ssh_config import connect

code = """require('dotenv').config({path:'backend/.env',quiet:true});const m=require('mongoose');(async()=>{await m.connect(process.env.MONGODB_URI);const ps=await m.connection.collection('products').find({$or:[{'serviceWorkflow.key':'rehab'},{name:/运动|复健|康复/}]}).project({name:1,originalPrice:1,status:1,validityDays:1,skus:1,category:1,tenantId:1}).toArray();const ts=await m.connection.collection('tenants').find({code:'jiayihui'}).project({code:1,name:1}).toArray();console.log(JSON.stringify({products:ps,tenants:ts}));await m.disconnect()})().catch(e=>{console.error(e.message);process.exit(1)})"""
c=connect()
_,o,e=c.exec_command('cd /var/www/jiayicare && node -e '+shlex.quote(code))
print(o.read().decode('utf-8'));print(e.read().decode('utf-8'))
exit_code=o.channel.recv_exit_status();c.close();raise SystemExit(exit_code)
