import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('39.106.218.225', username='root', password='@Cbq19900208', timeout=15)
def run(cmd):
    _, stdout, _ = ssh.exec_command(cmd, timeout=30)
    return stdout.read().decode('utf-8','replace')

# 读取 plan 页面
with open('D:/Claude CODE/plan_page.html', 'w', encoding='utf-8') as f:
    f.write(run('cat /var/www/xiaoyan/index.html'))

# 读取主站首页源码（通过 curl）
with open('D:/Claude CODE/main_page.html', 'w', encoding='utf-8') as f:
    f.write(run('curl -s http://localhost:3002/'))

ssh.close()
print('Done')
