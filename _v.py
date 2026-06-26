import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('121.40.156.39', username='root', password='Jiayi2026!', timeout=10)
i, o, e = c.exec_command('cat /var/www/jiayicare/app/dist/index.html | grep script')
print(o.read().decode('utf-8', errors='replace'))
c.close()
