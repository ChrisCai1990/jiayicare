import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('121.40.156.39', username='root', password='Jiayi2026!', timeout=15)
# Check SSL cert expiry
stdin, stdout, stderr = client.exec_command('echo | openssl s_client -connect jiaycare.com:443 -servername jiaycare.com 2>/dev/null | openssl x509 -noout -dates 2>/dev/null; ls -la /etc/nginx/ssl/')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
client.close()
