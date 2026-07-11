# 一次性只读诊断：复用 deploy.py 的 SSH 连接常量，不在本文件写明文密码。
# 上传诊断JS到服务器/tmp，用服务器的node跑（读生产库），打印后删除。用完即弃。
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import deploy  # 复用 HOST/USER/PASSWORD/REPO_DIR
import paramiko

DIAG_JS = r'''
const mongoose = require('mongoose');
const L = (...a) => process.stdout.write(a.join(' ') + '\n');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/jiayicare');
  const Admin = require('/var/www/jiayicare/backend/src/models/Admin');
  const FollowUp = require('/var/www/jiayicare/backend/src/models/FollowUp');
  const User = require('/var/www/jiayicare/backend/src/models/User');

  const xx = await Admin.findOne({ role: 'medicalAssistant' }).select('name role managerId').lean();
  L('=== 目标就医专员 ===');
  L(`  name=${xx.name} _id=${xx._id} role=${xx.role} managerId=${xx.managerId || '(无)'}`);

  // 完全复刻 GET /followups 的 ownerFilter（非familyDoctor分支）
  // visibleStaffIds = 自己 + 下属 + 带教团队成员。这里先只放自己（就医专员一般无下属），
  // 若结果为0再排查团队。
  const visibleStaffIds = [xx._id];
  const ownerFilter = { $or: [
    { assignedTo: { $in: visibleStaffIds } },
    { assignedTo: null, staffId: { $in: visibleStaffIds } },
  ] };
  const filter = { $and: [ownerFilter, {}, {}] };
  filter.status = 'planned';

  const cnt = await FollowUp.countDocuments(filter);
  L(`\n=== 复刻接口 GET /followups?status=planned 对她的返回条数: ${cnt} ===`);
  const rows = await FollowUp.find(filter).sort({ date: 1 }).limit(20)
    .select('theme date status assignedTo staffId sourceType').lean();
  rows.forEach(f => L(`  ${f.theme} | ${String(f.date).slice(0,10)} | assignedTo=${f.assignedTo} staffId=${f.staffId}`));

  // ★ 核心：待处理服务预约卡片只查 sourceType='order'。看 order 类随访都派给谁了
  const orderFus = await FollowUp.find({ sourceType: 'order', status: 'planned' })
    .populate('assignedTo', 'name role').populate('staffId', 'name role')
    .select('theme assignedTo staffId date').lean();
  L(`\n=== 全库 sourceType='order' 且 planned 的随访: ${orderFus.length} 条 ===`);
  orderFus.slice(0,20).forEach(f => L(`  ${f.theme} | 执行人=${f.assignedTo?.name || '(未指派→退回创建人)'} | 创建人=${f.staffId?.name}`));

  // order类里有派给嘉小夏的吗?
  const orderToXX = await FollowUp.countDocuments({ sourceType: 'order', assignedTo: xx._id });
  L(`\n=== sourceType='order' 且 assignedTo=嘉小夏: ${orderToXX} 条 ===`);

  // 就医陪同/医务代办 这类服务名的随访，sourceType都是什么?
  const svcNamed = await FollowUp.find({ theme: { $regex: '就医陪同|医务代办|陪诊|代办' } })
    .populate('assignedTo', 'name').select('theme sourceType status assignedTo').lean();
  L(`\n=== 名字含"就医陪同/医务代办/陪诊/代办"的随访: ${svcNamed.length} 条 ===`);
  svcNamed.slice(0,20).forEach(f => L(`  ${f.theme} | src=${f.sourceType} | status=${f.status} | 执行人=${f.assignedTo?.name || '(空)'}`));

  await mongoose.disconnect();
})().catch(e => { L('ERR ' + e.message); process.exit(1); });
'''

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(deploy.HOST, username=deploy.USER, password=deploy.PASSWORD, timeout=15)

sftp = ssh.open_sftp()
with sftp.file('/var/www/jiayicare/backend/_diag_tmp.js', 'w') as f:
    f.write(DIAG_JS)
sftp.close()

cmd = 'cd /var/www/jiayicare/backend && node _diag_tmp.js; rm -f _diag_tmp.js'
_, stdout, stderr = ssh.exec_command(cmd, timeout=60)
out = stdout.read().decode('utf-8', 'replace')
err = stderr.read().decode('utf-8', 'replace')
print(out)
if err.strip():
    print('--- stderr ---')
    print(err)
ssh.close()
