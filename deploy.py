import paramiko
import os
import sys

HOST = "39.106.218.225"
USER = "root"
PASS = "@Cbq19900208"
REMOTE_DIR = "/var/www/huize-jiagong"
LOCAL_DIR = r"D:\Claude CODE\huize-jiagong"

def ssh_run(client, cmd, print_output=True):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    if print_output and out:
        print(out)
    if err:
        print("STDERR:", err)
    return out

def upload_dir(sftp, local_path, remote_path):
    """Recursively upload a directory."""
    try:
        sftp.mkdir(remote_path)
    except:
        pass
    for item in os.listdir(local_path):
        local_item = os.path.join(local_path, item)
        remote_item = remote_path + "/" + item
        if os.path.isdir(local_item):
            upload_dir(sftp, local_item, remote_item)
        else:
            sftp.put(local_item, remote_item)
            print(f"  ↑ {remote_item}")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

print(f"Connecting to {HOST}...")
client.connect(HOST, username=USER, password=PASS, timeout=15)
print("Connected!")

# Check environment
ssh_run(client, "node -v && npm -v && pm2 -v && nginx -v 2>&1")

# Create remote dir
ssh_run(client, f"mkdir -p {REMOTE_DIR}")

# Upload files via SFTP
print("\nUploading files...")
sftp = client.open_sftp()

# Upload .next (build output)
upload_dir(sftp, os.path.join(LOCAL_DIR, ".next"), REMOTE_DIR + "/.next")

# Upload public
if os.path.exists(os.path.join(LOCAL_DIR, "public")):
    upload_dir(sftp, os.path.join(LOCAL_DIR, "public"), REMOTE_DIR + "/public")

# Upload package.json & package-lock.json
for f in ["package.json", "package-lock.json", "next.config.ts"]:
    src = os.path.join(LOCAL_DIR, f)
    if os.path.exists(src):
        sftp.put(src, REMOTE_DIR + "/" + f)
        print(f"  ↑ {f}")

sftp.close()

# Install prod deps on server
ssh_run(client, f"cd {REMOTE_DIR} && npm install --omit=dev 2>&1 | tail -5")

# Write PM2 ecosystem config
ecosystem = f"""module.exports = {{
  apps: [{{
    name: 'huize-jiagong',
    cwd: '{REMOTE_DIR}',
    script: 'node_modules/.bin/next',
    args: 'start -p 3001',
    env: {{
      NODE_ENV: 'production',
      PORT: 3001
    }}
  }}]
}};
"""
with open("/tmp/ecosystem.config.js", "w") as f:
    f.write(ecosystem)
sftp2 = client.open_sftp()
sftp2.put("/tmp/ecosystem.config.js", REMOTE_DIR + "/ecosystem.config.js")
sftp2.close()

# Start/restart with PM2
ssh_run(client, f"cd {REMOTE_DIR} && pm2 delete huize-jiagong 2>/dev/null; pm2 start ecosystem.config.js")
ssh_run(client, "pm2 save")
ssh_run(client, "pm2 list")

# Write nginx config
nginx_conf = """server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
"""
with open("/tmp/huize.conf", "w") as f:
    f.write(nginx_conf)
sftp3 = client.open_sftp()
sftp3.put("/tmp/huize.conf", "/etc/nginx/conf.d/huize-jiagong.conf")
sftp3.close()

# Test and reload nginx
ssh_run(client, "nginx -t && nginx -s reload")

print("\n✅ 部署完成！访问 http://39.106.218.225")
client.close()
