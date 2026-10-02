#!/usr/bin/env python3
"""Read-only lookup of named pilot members and their assigned health advisors."""
import json
import shlex
import sys

from ssh_config import connect


REMOTE = r'''
require('dotenv').config({path:'backend/.env',quiet:true});
const {MongoClient}=require('mongoose').mongo;
const names=JSON.parse(process.env.PILOT_NAMES_JSON);
(async()=>{
 const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 try{
  await client.connect(); const db=client.db();
  const users=await db.collection('users').find({name:{$in:names}},
    {projection:{_id:1,name:1,isDeleted:1,tenantId:1,assignedFamilyDoctor:1}}).toArray();
  const advisorIds=[...new Set(users.map(u=>String(u.assignedFamilyDoctor||'')).filter(Boolean))]
    .map(id=>new (require('mongoose').Types.ObjectId)(id));
  const admins=await db.collection('admins').find({_id:{$in:advisorIds}},
    {projection:{_id:1,name:1,role:1,staffStatus:1,tenantId:1}}).toArray();
  const byId=new Map(admins.map(a=>[String(a._id),a]));
  const rows=names.map(name=>({name,matches:users.filter(u=>u.name===name).map(u=>{
    const a=byId.get(String(u.assignedFamilyDoctor||''));
    return {id:String(u._id),active:u.isDeleted!==true,tenantId:String(u.tenantId||''),
      advisorId:String(u.assignedFamilyDoctor||''),advisorName:a?.name||'',advisorRole:a?.role||'',
      advisorStatus:a?.staffStatus||'missing',sameTenant:!!a&&String(a.tenantId||'')===String(u.tenantId||'')};
  })}));
  console.log(JSON.stringify(rows));
 }finally{await client.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
'''


if __name__ == '__main__':
    names = sys.argv[1:]
    if not names:
        raise SystemExit('Usage: audit_health_risk_pilot.py NAME [NAME ...]')
    command = (
        'cd /var/www/jiayicare && '
        + 'PILOT_NAMES_JSON=' + shlex.quote(json.dumps(names, ensure_ascii=False))
        + ' node -e ' + shlex.quote(REMOTE)
    )
    with connect() as ssh:
        _, out, err = ssh.exec_command(command, timeout=45)
        output = out.read().decode('utf-8', 'replace')
        error = err.read().decode('utf-8', 'replace')
        code = out.channel.recv_exit_status()
        if code:
            raise SystemExit('Read-only pilot lookup failed: ' + error[:300])
        print(json.dumps(json.loads(output), ensure_ascii=False, indent=2))
