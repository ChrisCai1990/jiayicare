import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('121.40.156.39', username='root', password='Jiayi2026!', timeout=15)

def run(cmd, timeout=30):
    _, out, _ = ssh.exec_command(cmd, timeout=timeout, get_pty=True)
    for line in iter(out.readline, ''):
        line = line.rstrip()
        if line:
            print(line)

# 是否有根目录 .env?
print('=== root .env ===')
run('ls -la /var/www/jiayicare/.env 2>/dev/null || echo "no root .env"')

# .npmrc?
print('=== .npmrc ===')
run('cat /var/www/jiayicare/.npmrc 2>/dev/null || echo "no .npmrc"')
run('cat /root/.npmrc 2>/dev/null || echo "no root .npmrc"')

# npm config production
print('=== npm config production ===')
run('npm config get production')

# env 里实际的 NODE_ENV
print('=== env NODE_ENV ===')
run('env | grep NODE_ENV || echo "NODE_ENV not set in env"')

ssh.close()
print('done')
