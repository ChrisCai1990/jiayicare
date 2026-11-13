"""Stream the read-only business attribution audit to the existing production host."""
from pathlib import Path
import sys
from ssh_config import connect


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    source = Path(__file__).with_name('audit_business_attribution_readonly.js').read_text(encoding='utf-8')
    ssh = connect()
    try:
        stdin, stdout, stderr = ssh.exec_command('cd /var/www/jiayicare/backend && node -', timeout=60)
        stdin.write(source)
        stdin.channel.shutdown_write()
        output = stdout.read().decode('utf-8', 'replace')
        error = stderr.read().decode('utf-8', 'replace')
        print(output.strip())
        if stdout.channel.recv_exit_status():
            raise RuntimeError(error.strip() or 'Audit failed')
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
