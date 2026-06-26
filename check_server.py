import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('121.40.156.39', username='root', password='Jiayi2026!', timeout=15)

# Check git commit on server
stdin, stdout, stderr = client.exec_command('cd /var/www/jiayicare && git log --oneline -3')
out = stdout.read().decode('utf-8', errors='replace')
print("=== SERVER GIT LOG ===")
print(out)

# Check what app dist was last built from - look at index.html timestamp vs git commit time
stdin, stdout, stderr = client.exec_command('ls -la /var/www/jiayicare/app/dist/ && stat /var/www/jiayicare/app/dist/index.html')
out = stdout.read().decode('utf-8', errors='replace')
print("=== DIST FILES ===")
print(out)

client.close()
