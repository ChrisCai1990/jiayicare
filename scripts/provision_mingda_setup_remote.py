"""One-time guarded Mingda setup account provisioning. Prints the initial password once."""
import shlex
from ssh_config import connect

SCRIPT = r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const mongoose=require('mongoose');
const crypto=require('crypto');
const Tenant=require('./backend/src/models/Tenant');
const Admin=require('./backend/src/models/Admin');
const User=require('./backend/src/models/User');
(async()=>{try{
 await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 const tenant=await Tenant.findOne({code:'mingdahealth'});
 if(!tenant||tenant.status!=='suspended'||tenant.commercialPlan!=='standard')throw Error('Mingda status or plan mismatch');
 if(JSON.stringify([...tenant.serviceScope].sort())!==JSON.stringify(['admin','staff']))throw Error('Mingda channels mismatch');
 if((tenant.websiteHosts||[]).length)throw Error('Mingda website hosts must be empty');
 if(await Admin.countDocuments({tenantId:tenant._id})||await User.countDocuments({tenantId:tenant._id}))throw Error('Mingda is not empty');
 if(await Admin.exists({username:'mingda_admin'}))throw Error('Username already exists');
 const password=crypto.randomBytes(21).toString('base64url');
 tenant.status='setup';await tenant.save();
 try{await Admin.create({username:'mingda_admin',password,name:'明大机构管理员',role:'superadmin',tenantId:tenant._id,mustChangePassword:true})}
 catch(e){tenant.status='suspended';await tenant.save();throw e}
 console.log(JSON.stringify({tenant:'mingdahealth',status:tenant.status,username:'mingda_admin',initialPassword:password,requiresPasswordChange:true}));
}finally{await mongoose.disconnect()}})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

if __name__ == '__main__':
    with connect() as ssh:
        _, out, err = ssh.exec_command('cd /var/www/jiayicare && node -e ' + shlex.quote(SCRIPT), timeout=45)
        data, error = out.read().decode('utf-8'), err.read().decode('utf-8')
        if out.channel.recv_exit_status():
            raise SystemExit(error[:500] or 'Provisioning failed')
        print(data.strip())
