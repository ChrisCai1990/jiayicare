import paramiko, time, sys

HOST  = '39.106.218.225'
USER  = 'root'
PASS  = '@Cbq19900208'
TOKEN = 'YOUR_GITHUB_TOKEN_HERE'  # 替换为实际 token，不要提交到 git

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)
print('Connected')

def run(cmd, timeout=30):
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout, get_pty=False)
    out = stdout.read().decode('utf-8', 'replace').strip()
    err = stderr.read().decode('utf-8', 'replace').strip()
    code = stdout.channel.recv_exit_status()
    return code, (out + '\n' + err).strip()

# 写部署脚本到服务器
SCRIPT = r"""#!/bin/bash
set -e
LOG=/var/log/huize-deploy.log
echo '=== Deploy started ===' > $LOG
date >> $LOG

cd /var/www

if [ -d huize-jiagong/.git ]; then
  echo 'pulling...' >> $LOG
  cd huize-jiagong
  git fetch origin main >> $LOG 2>&1
  git reset --hard origin/main >> $LOG 2>&1
else
  echo 'cloning...' >> $LOG
  rm -rf huize-jiagong
  git clone https://TOKEN_PLACEHOLDER@github.com/ChrisCai1990/huize-jiagong.git huize-jiagong >> $LOG 2>&1
  cd huize-jiagong
fi

echo 'npm ci...' >> $LOG
npm ci >> $LOG 2>&1

echo 'npm run build...' >> $LOG
npm run build >> $LOG 2>&1

echo 'copy static...' >> $LOG
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static

echo 'pm2 restart...' >> $LOG
pm2 delete huize-jiagong 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
sleep 1
pm2 start .next/standalone/server.js --name huize-jiagong -- --port 3001 --hostname 0.0.0.0 >> $LOG 2>&1
pm2 save >> $LOG 2>&1

echo '=== Deploy done ===' >> $LOG
""".replace('TOKEN_PLACEHOLDER', TOKEN)

# 写脚本文件
_, out = run("echo 'writing script'", 5)
sftp = ssh.open_sftp()
with sftp.open('/tmp/huize-deploy.sh', 'w') as f:
    f.write(SCRIPT)
sftp.close()
run('chmod +x /tmp/huize-deploy.sh', 5)
print('Script written to server')

# 清空旧日志
run('echo "" > /var/log/huize-deploy.log', 5)

# 后台执行
run('nohup bash /tmp/huize-deploy.sh > /dev/null 2>&1 &', 10)
print('Deploy running in background...\n')

# 轮询日志，每30秒一次，最多20次（10分钟）
for i in range(20):
    time.sleep(30)
    code, log = run('tail -8 /var/log/huize-deploy.log 2>/dev/null || echo NOT_STARTED', 10)
    elapsed = (i+1)*30
    print(f'[{elapsed}s]\n{log}\n')
    if 'Deploy done' in log:
        print('✅ DEPLOY COMPLETE')
        break
    if 'npm ERR' in log or 'Build failed' in log:
        code2, full = run('cat /var/log/huize-deploy.log', 15)
        print('❌ BUILD ERROR:\n', full[-2000:])
        ssh.close()
        sys.exit(1)

# 最终状态
code, out = run('pm2 list --no-color', 10)
print('\nPM2 STATUS:\n', out)
ssh.close()
