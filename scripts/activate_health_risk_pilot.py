#!/usr/bin/env python3
"""Enable the four-member risk pilot after deployment, using verified live IDs."""
import json
import shlex
import subprocess

from ssh_config import connect


REMOTE = r'''
const fs=require('fs');
const mongoose=require('mongoose');
const envPath='backend/.env';
require('dotenv').config({path:envPath,quiet:true});
const names=['丛晶','陈乐之','潘孝成','金娟'];
(async()=>{
  const client=new mongoose.mongo.MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
  try {
    await client.connect();
    const db=client.db();
    const users=await db.collection('users').find({name:{$in:names}},
      {projection:{_id:1,name:1,isDeleted:1,tenantId:1,assignedFamilyDoctor:1}}).toArray();
    const selected=names.map(name=>{
      const active=users.filter(u=>u.name===name && u.isDeleted!==true);
      if(active.length!==1) throw Error('Expected one active member for each pilot name');
      return active[0];
    });
    const advisorIds=selected.map(u=>u.assignedFamilyDoctor);
    if(advisorIds.some(id=>!id)) throw Error('Pilot member lacks an advisor');
    const advisors=await db.collection('admins').find({_id:{$in:advisorIds}},
      {projection:{_id:1,role:1,staffStatus:1,tenantId:1}}).toArray();
    const byId=new Map(advisors.map(a=>[String(a._id),a]));
    for(const user of selected){
      const advisor=byId.get(String(user.assignedFamilyDoctor));
      if(!advisor || advisor.role!=='familyDoctor' || advisor.staffStatus!=='active'
        || String(advisor.tenantId)!==String(user.tenantId)) throw Error('Pilot advisor assignment is invalid');
    }
    const current=fs.readFileSync(envPath,'utf8');
    const next=current.split(/\r?\n/).filter(line=>
      !/^\s*(HEALTH_RISK_ROLLOUT_MODE|HEALTH_RISK_PATIENT_IDS)\s*=/.test(line)).join('\n').replace(/\n*$/,'\n')
      + 'HEALTH_RISK_ROLLOUT_MODE=allowlist\n'
      + 'HEALTH_RISK_PATIENT_IDS=' + selected.map(u=>String(u._id)).join(',') + '\n';
    if(!fs.lstatSync(envPath).isFile()) throw Error('Backend environment must be a regular file');
    const stat=fs.statSync(envPath);
    const temp=envPath+'.health-risk-next';
    fs.writeFileSync(temp,next,{mode:stat.mode & 0o777});
    fs.chownSync(temp,stat.uid,stat.gid);
    fs.renameSync(temp,envPath);
    console.log(JSON.stringify({pilotMembers:selected.length,advisors:new Set(advisorIds.map(String)).size,enabled:true}));
  } finally { await client.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1});
'''


def remote(ssh, command, timeout=45):
    _, out, err = ssh.exec_command(command, timeout=timeout)
    output = out.read().decode('utf-8', 'replace').strip()
    error = err.read().decode('utf-8', 'replace').strip()
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[:400] or f'Remote command failed ({code})')
    return output


if __name__ == '__main__':
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    with connect() as ssh:
        deployed = remote(ssh, 'git -C /var/www/jiayicare rev-parse HEAD', 15)
        if deployed != revision:
            raise SystemExit('Production commit differs from local master; pilot not activated')
        result = remote(ssh, 'cd /var/www/jiayicare && node -e ' + shlex.quote(REMOTE))
        print(result)
        print(remote(ssh, 'pm2 restart jiayicare-backend', 40).splitlines()[-1])
        print(remote(ssh, 'curl -fsS http://127.0.0.1:3000/api/health', 15))
