# 修历史脏数据：把"派给别人却被误置completed"的服务随访改回planned。
# 复用 deploy.py 的SSH常量，脚本内不写明文密码。dry-run 默认，--apply 才写。
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import deploy
import paramiko

APPLY = '--apply' in sys.argv

FIX_JS = r'''
const APPLY = process.argv.includes('--apply');
const mongoose = require('mongoose');
const L = (...a) => process.stdout.write(a.join(' ') + '\n');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/jiayicare');
  require('/var/www/jiayicare/backend/src/models/Admin');
  const FollowUp = require('/var/www/jiayicare/backend/src/models/FollowUp');

  // 命中条件：指派给了别人(assignedTo != staffId)、当前是completed、且是服务预约类
  // (sourceType='order' 或 theme含就医陪同/医务代办/陪诊/代办)。
  // 这类"派给别人的活"不该是completed——扭转时被表单写死completed污染的，改回planned让执行人看到。
  const candidates = await FollowUp.find({
    status: 'completed',
    assignedTo: { $ne: null },
    $expr: { $ne: ['$assignedTo', '$staffId'] },
    $or: [
      { sourceType: 'order' },
      { theme: { $regex: '就医陪同|医务代办|陪诊|代办|一站式' } },
    ],
  }).populate('assignedTo', 'name').populate('staffId', 'name').lean();

  L(`命中 ${candidates.length} 条待修（派给别人却是completed的服务随访）：`);
  candidates.forEach(f => L(`  ${f.theme} | 执行人=${f.assignedTo && f.assignedTo.name} | 派单人=${f.staffId && f.staffId.name} | ${String(f.date).slice(0,10)}`));

  if (APPLY && candidates.length) {
    const ids = candidates.map(f => f._id);
    const r = await FollowUp.updateMany(
      { _id: { $in: ids } },
      { $set: { status: 'planned', completedAt: null } }
    );
    L(`\n已改回 planned：matched=${r.matchedCount} modified=${r.modifiedCount}`);
  } else if (!APPLY) {
    L('\n[dry-run] 未写库。确认无误后加 --apply。');
  }
  await mongoose.disconnect();
})().catch(e => { L('ERR ' + e.message); process.exit(1); });
'''

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(deploy.HOST, username=deploy.USER, password=deploy.PASSWORD, timeout=15)
sftp = ssh.open_sftp()
with sftp.file('/var/www/jiayicare/backend/_fix_tmp.js', 'w') as f:
    f.write(FIX_JS)
sftp.close()
flag = '--apply' if APPLY else ''
cmd = f'cd /var/www/jiayicare/backend && node _fix_tmp.js {flag}; rm -f _fix_tmp.js'
_, stdout, stderr = ssh.exec_command(cmd, timeout=60)
print(stdout.read().decode('utf-8', 'replace'))
err = stderr.read().decode('utf-8', 'replace')
if err.strip(): print('--- stderr ---\n' + err)
ssh.close()
