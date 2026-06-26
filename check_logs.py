import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('121.40.156.39', username='root', password='Jiayi2026!', timeout=15)
stdin, stdout, stderr = client.exec_command('pm2 logs jiayicare-backend --lines 50 --nostream 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print(out[-3000:])
client.close()
