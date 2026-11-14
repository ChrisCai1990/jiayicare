"""Read-only counts of current partner configuration in production."""
import base64
import hashlib
import os
from pathlib import Path

from ssh_config import connect

known_hosts = Path('C:/Users/huawei/.ssh/known_hosts')
entry = next(line for line in known_hosts.read_text(encoding='utf-8').splitlines()
             if line.startswith('121.40.156.39 ssh-ed25519 '))
os.environ['JIAYICARE_SSH_HOST_FINGERPRINT'] = 'SHA256:' + base64.b64encode(
    hashlib.sha256(base64.b64decode(entry.split()[2])).digest()).decode().rstrip('=')

script = r'''
const { execFileSync } = require('node:child_process');
const mongoose = require('mongoose');
async function main() {
  const list = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
  const env = list.find(item => item.name === 'jiayicare-backend')?.pm2_env;
  const uri = process.env.MONGODB_URI || env?.MONGODB_URI || env?.env?.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    const db = mongoose.connection.db;
    const names = ['marketpartners', 'marketpartnerrules', 'staffcommissionrules',
      'partnerteams', 'partnerteamrelations', 'partnerteamrules', 'marketpartnerliaisons'];
    const out = {};
    for (const name of names) out[name] = await db.collection(name).countDocuments({});
    const partners = await db.collection('marketpartners').find({},
      { projection: { name: 1, status: 1, segment: 1 } }).sort({ name: 1 }).toArray();
    const now = new Date();
    out.partners = await Promise.all(partners.map(async p => ({
      name: p.name, status: p.status, segment: p.segment,
      activeRules: await db.collection('marketpartnerrules').countDocuments({
        partnerId: p._id, status: 'active', disabled: { $ne: true },
        effectiveFrom: { $lte: now }, $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: now } }],
      }),
      activeLiaison: await db.collection('marketpartnerliaisons').countDocuments({
        partnerId: p._id, effectiveUntil: null }),
      ownTeam: await db.collection('partnerteams').countDocuments({
        leaderType: 'partner', leaderId: p._id, effectiveUntil: null }),
      teamMember: await db.collection('partnerteamrelations').countDocuments({
        memberType: 'partner', memberId: p._id, effectiveUntil: null }),
    })));
    console.log(JSON.stringify(out));
  } finally { await mongoose.disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
'''
encoded = base64.b64encode(script.encode()).decode()
command = f"cd /var/www/jiayicare/backend && node -e \"eval(Buffer.from('{encoded}','base64').toString())\""
with connect() as ssh:
    _, stdout, stderr = ssh.exec_command(command, timeout=20)
    output = stdout.read().decode().strip()
    error = stderr.read().decode().strip()
    if stdout.channel.recv_exit_status():
        raise SystemExit(f'生产只读审计失败: {error or output}')
    print(output)
