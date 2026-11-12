#!/usr/bin/env python3
"""Preserve the exact known live edits before the notification release."""
import argparse
from pathlib import Path

from ssh_config import connect

ROOT = '/var/www/jiayicare'
EXPECTED_HEAD = '3b424783916c2f24f40f9b16205420febc2d2b5e'
FILES = (
    'backend/src/utils/healthRecordSummary.js',
    'geo-knowledge-center/articles-page-2.html',
    'geo-knowledge-center/articles-page-3.html',
    'geo-knowledge-center/content/articles/blood-pressure-recording-preparation.json',
    'geo-knowledge-center/feed.xml',
    'geo-knowledge-center/index.html',
    'geo-knowledge-center/published-articles.json',
    'geo-knowledge-center/sitemap.xml',
)
BACKUP = '/var/backups/jiayicare-notification-gate-20261112/live-edits.patch'
BUNDLE = '/tmp/jiayicare-notification-live-preserved-20261112.bundle'


def run(client, command, timeout=30):
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode('utf-8', 'replace').rstrip('\r\n')
    error = stderr.read().decode('utf-8', 'replace').strip()
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f'remote command failed ({code}): {error[:500]}')
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--bundle-out', default='notification-live-preserved-20261112.bundle')
    args = parser.parse_args()
    with connect() as client:
        head = run(client, f'git -C {ROOT} rev-parse HEAD')
        branch = run(client, f'git -C {ROOT} branch --show-current')
        status = run(client, f'git -C {ROOT} status --porcelain --untracked-files=no')
        expected_status = '\n'.join(f' M {path}' for path in FILES)
        if head != EXPECTED_HEAD or branch != 'master' or status != expected_status:
            raise RuntimeError('Production Git state changed; no files were modified')
        run(client, f'git -C {ROOT} diff --cached --quiet')
        run(client, f'test ! -e {ROOT}/.git/index.lock')
        print(f'verified {branch} {head[:12]} with {len(FILES)} known unstaged files')
        if not args.apply:
            return
        paths = ' '.join(FILES)
        run(client, f'mkdir -p /var/backups/jiayicare-notification-gate-20261112 && test ! -e {BACKUP}')
        run(client, f'git -C {ROOT} diff --binary -- {paths} > {BACKUP}')
        backup_hash = run(client, f'sha256sum {BACKUP}').split()[0]
        run(client, f'git -C {ROOT} add -- {paths}')
        run(client, f'git -C {ROOT} -c user.name=Codex -c user.email=codex@openai.com commit -m "Preserve live report and GEO edits before notification release"', timeout=60)
        new_head = run(client, f'git -C {ROOT} rev-parse HEAD')
        if run(client, f'git -C {ROOT} status --porcelain --untracked-files=no'):
            raise RuntimeError('Production commit succeeded but tracked changes remain')
        run(client, f'git -C {ROOT} bundle create {BUNDLE} HEAD ^{EXPECTED_HEAD}', timeout=90)
        destination = Path(args.bundle_out).resolve()
        with client.open_sftp() as sftp:
            sftp.get(BUNDLE, str(destination))
        print(f'preserved_commit={new_head} backup_sha256={backup_hash} bundle={destination}')


if __name__ == '__main__':
    main()
