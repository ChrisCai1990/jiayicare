"""Allow the 100 MB staff report upload advertised in the UI through Nginx."""

import datetime
import shlex

from ssh_config import connect

SOURCE = "/etc/nginx/sites-enabled/jiayicare"
MARKER = "# staff-report-upload-limit-v1"
LOCATION = f"""    {MARKER}
    location = /api/staff/upload/report-file {{
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 110m;
    }}
"""


def run(ssh, command):
    _, out, err = ssh.exec_command(command)
    output = out.read().decode("utf-8", "replace") + err.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(f"{command}: {output}")
    return output


ssh = connect()
try:
    source = run(ssh, f"readlink -f {shlex.quote(SOURCE)}").strip()
    sftp = ssh.open_sftp()
    with sftp.open(source, "r") as handle:
        config = handle.read().decode("utf-8")
    if MARKER in config:
        print("Upload limit already configured")
    else:
        api = config.index("    location /api/ {")
        staff = config.index("server_name staff.jiaycare.com;")
        if api >= staff:
            raise RuntimeError("Cannot identify main API block before Staff server")
        updated = config[:api] + LOCATION + "\n" + config[api:]
        remote_tmp = "/tmp/jiayicare-staff-upload-limit.conf"
        with sftp.open(remote_tmp, "w") as handle:
            handle.write(updated.encode("utf-8"))
        backup = f"{source}.bak-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
        run(ssh, f"cp {shlex.quote(source)} {shlex.quote(backup)}")
        try:
            run(ssh, f"install -m 644 {shlex.quote(remote_tmp)} {shlex.quote(source)}")
            run(ssh, "nginx -t")
            run(ssh, "systemctl reload nginx")
        except Exception:
            run(ssh, f"cp {shlex.quote(backup)} {shlex.quote(source)} && nginx -t && systemctl reload nginx")
            raise
        finally:
            run(ssh, f"rm -f {shlex.quote(remote_tmp)}")
        print("Configured Staff report upload limit: 110 MB")
    sftp.close()
finally:
    ssh.close()
