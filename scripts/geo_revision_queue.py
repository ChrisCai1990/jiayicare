"""Authenticated GEO queue bridge. list is read-only; resubmit never publishes."""
import argparse
import json
import shlex
from pathlib import Path
from ssh_config import connect

parser = argparse.ArgumentParser()
parser.add_argument('command', choices=['list', 'status', 'resubmit'])
parser.add_argument('--slug')
parser.add_argument('--input', type=Path)
args = parser.parse_args()
payload = None
if args.command == 'resubmit':
    if not args.input:
        parser.error('resubmit requires --input UTF-8 JSON file')
    payload = json.dumps(json.loads(args.input.read_text(encoding='utf-8-sig')), ensure_ascii=False)
if args.command == 'status' and not args.slug:
    parser.error('status requires --slug')
command = 'cd /var/www/jiayicare && node backend/src/scripts/geoRevisionQueue.js ' + args.command
if args.command == 'status':
    command += ' ' + shlex.quote(args.slug)
with connect() as client:
    stdin, stdout, stderr = client.exec_command(command, timeout=45)
    if payload:
        stdin.write(payload)
    stdin.channel.shutdown_write()
    output = stdout.read().decode('utf-8')
    error = stderr.read().decode('utf-8')
    print(output)
    if error:
        print(error)
    raise SystemExit(stdout.channel.recv_exit_status())
